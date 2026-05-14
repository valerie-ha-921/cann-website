/**
 * Module 3: Attractor Canyon — 5-stage sequential narrative
 *
 * Stage 1 — Ring + bump profile: "Why does this pattern remain stable?"
 * Stage 2 — Canyon transition: bump → ball-in-canyon metaphor
 * Stage 3 — Canyon landscape: interactive, labels, flat floor + steep walls
 * Stage 4 — Push floor vs push wall: demonstrate neutral vs restoring stability
 * Stage 5 — Noise & drift: ball jitters along floor; drift magnitude shown
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { NarrativeStrip } from './NarrativeStrip';
import { useNetworkStore } from '../store/networkStore';
import { dist } from '../simulation/dynamics';

const DT = 0.05;
const PI = Math.PI;

// ─────────────────────────────────────────────────────────────────────────────
// Shared drawing helpers
// ─────────────────────────────────────────────────────────────────────────────

function fillBg(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.fillStyle = '#080f1e';
  ctx.fillRect(0, 0, w, h);
}

// Draw the ring of neurons with activity bars pointing inward
function drawNeuralRing(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  R: number,
  u: Float64Array,
  x: Float64Array | number[],
  alpha = 1
) {
  const N = u.length;
  const step = Math.max(1, Math.floor(N / 80));
  let maxU = 0;
  for (let i = 0; i < N; i++) if (u[i] > maxU) maxU = u[i];
  if (maxU < 0.01) maxU = 1;

  // Ring
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, 2 * PI);
  ctx.strokeStyle = `rgba(30,58,95,${alpha})`;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Neurons + bars
  for (let idx = 0; idx < 80; idx++) {
    const i = (idx * step) % N;
    const angle = x[i] - PI / 2;
    const nx = cx + Math.cos(angle) * R;
    const ny = cy + Math.sin(angle) * R;
    const norm = Math.min(u[i] / maxU, 1);

    const barLen = norm * 42;
    ctx.beginPath();
    ctx.moveTo(nx, ny);
    ctx.lineTo(cx + Math.cos(angle) * (R - barLen), cy + Math.sin(angle) * (R - barLen));
    ctx.strokeStyle = `rgba(96,165,250,${alpha * (0.12 + norm * 0.78)})`;
    ctx.lineWidth = 3.5;
    ctx.stroke();

    const b = Math.round(norm * 195 + 30);
    ctx.beginPath();
    ctx.arc(nx, ny, 4.5, 0, 2 * PI);
    ctx.fillStyle = `rgba(${Math.round(norm * 20)},${Math.round(norm * 55)},${b},${alpha * (0.35 + norm * 0.65)})`;
    ctx.fill();
  }
}

// Draw the canyon landscape with the ball
function drawCanyonLandscape(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  decodedAngle: number,
  bumpAmplitude: number,
  targetAmplitude: number,
  opts: {
    showLabels?: boolean;
    showWallArrow?: boolean;
    showFloorArrow?: 1 | -1 | null;
    trailAngles?: number[];
    glowBall?: boolean;
    transitionAlpha?: number; // 0→1 for fade-in
  } = {}
) {
  const {
    showLabels = true,
    showFloorArrow = null,
    trailAngles = [],
    glowBall = false,
    transitionAlpha = 1,
  } = opts;

  const a = transitionAlpha;
  ctx.globalAlpha = a;

  const pL = 58, pR = 18, pT = 44, pB = 46;
  const pw = w - pL - pR, ph = h - pT - pB;

  const toSX = (angle: number) => pL + ((angle + PI) / (2 * PI)) * pw;
  const toSY = (energy: number) => pT + ph * (1 - Math.max(0, Math.min(1, energy)));

  // Canyon walls gradient fill
  const wallGrad = ctx.createLinearGradient(pL, pT, pL, pT + ph);
  wallGrad.addColorStop(0, 'rgba(88,60,200,0.18)');
  wallGrad.addColorStop(0.45, 'rgba(55,40,140,0.08)');
  wallGrad.addColorStop(0.7, 'rgba(20,30,70,0.04)');
  wallGrad.addColorStop(1, 'rgba(10,18,42,0)');
  ctx.fillStyle = wallGrad;
  ctx.fillRect(pL, pT, pw, ph);

  // Canyon floor band
  const floorBandH = ph * 0.12;
  const floorY = toSY(0.06);
  ctx.fillStyle = 'rgba(20,40,80,0.45)';
  ctx.fillRect(pL, floorY, pw, floorBandH);

  // Wall rim curve
  ctx.beginPath();
  ctx.strokeStyle = `rgba(139,92,246,0.55)`;
  ctx.lineWidth = 2;
  for (let xp = pL; xp <= pL + pw; xp++) {
    const frac = (xp - pL) / pw;
    const rimE = 0.82 + 0.08 * Math.cos((frac - 0.5) * 2);
    const yp = toSY(rimE);
    if (xp === pL) ctx.moveTo(xp, yp); else ctx.lineTo(xp, yp);
  }
  ctx.stroke();

  // Floor line (dashed)
  ctx.strokeStyle = `rgba(30,58,95,0.7)`;
  ctx.lineWidth = 1;
  ctx.setLineDash([5, 5]);
  ctx.beginPath();
  ctx.moveTo(pL, toSY(0.06)); ctx.lineTo(pL + pw, toSY(0.06));
  ctx.stroke();
  ctx.setLineDash([]);

  // Axes
  ctx.strokeStyle = `rgba(30,58,95,0.9)`;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(pL, pT); ctx.lineTo(pL, pT + ph); ctx.lineTo(pL + pw, pT + ph);
  ctx.stroke();

  if (showLabels) {
    ctx.fillStyle = '#475569';
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('-π', pL, pT + ph + 16);
    ctx.fillText('0', pL + pw / 2, pT + ph + 16);
    ctx.fillText('π', pL + pw, pT + ph + 16);
    ctx.fillText('position (angle)', pL + pw / 2, pT + ph + 32);

    ctx.save();
    ctx.translate(18, pT + ph / 2);
    ctx.rotate(-PI / 2);
    ctx.textAlign = 'center';
    ctx.fillText('distortion energy', 0, 0);
    ctx.restore();

    // "flat floor" and "steep walls" annotations
    ctx.fillStyle = 'rgba(52,211,153,0.6)';
    ctx.font = '9px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('← flat floor: position free', pL + 4, toSY(0.06) - 5);

    ctx.fillStyle = 'rgba(139,92,246,0.6)';
    ctx.textAlign = 'right';
    ctx.fillText('steep walls: shape costly →', pL + pw - 4, toSY(0.78) + 12);
  }

  // Trail
  if (trailAngles.length > 1) {
    for (let i = 0; i < trailAngles.length - 1; i++) {
      const fracAlpha = (i / trailAngles.length) * 0.6;
      const tx = toSX(trailAngles[i]);
      ctx.beginPath();
      ctx.arc(tx, toSY(0.06) + 4, 3.5, 0, 2 * PI);
      ctx.fillStyle = `rgba(99,102,241,${fracAlpha})`;
      ctx.fill();
    }
  }

  // Ball
  const ampDiff = Math.abs(bumpAmplitude - targetAmplitude);
  const ballE = Math.min(0.72, 0.06 + ampDiff * 0.14);
  const ballX = toSX(decodedAngle);
  const ballY = toSY(ballE);

  // Shadow on floor
  ctx.beginPath();
  ctx.ellipse(ballX, toSY(0.06) + 6, 11, 4.5, 0, 0, 2 * PI);
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fill();

  if (glowBall) {
    const grd = ctx.createRadialGradient(ballX, ballY, 4, ballX, ballY, 28);
    grd.addColorStop(0, 'rgba(167,139,250,0.45)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.beginPath();
    ctx.arc(ballX, ballY, 28, 0, 2 * PI);
    ctx.fillStyle = grd;
    ctx.fill();
  }

  const ballGrd = ctx.createRadialGradient(ballX - 4, ballY - 5, 2, ballX, ballY, 13);
  ballGrd.addColorStop(0, '#c4b5fd');
  ballGrd.addColorStop(1, '#6d28d9');
  ctx.beginPath();
  ctx.arc(ballX, ballY, 13, 0, 2 * PI);
  ctx.fillStyle = ballGrd;
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Floor-push arrow
  if (showFloorArrow !== null) {
    const arrowX = ballX + (showFloorArrow > 0 ? 30 : -30);
    const arrowY = toSY(0.06) + 2;
    ctx.strokeStyle = '#34d399';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(ballX + showFloorArrow * 14, arrowY);
    ctx.lineTo(arrowX, arrowY);
    ctx.stroke();
    const tip = showFloorArrow;
    ctx.beginPath();
    ctx.moveTo(arrowX, arrowY);
    ctx.lineTo(arrowX - tip * 7, arrowY - 5);
    ctx.lineTo(arrowX - tip * 7, arrowY + 5);
    ctx.closePath();
    ctx.fillStyle = '#34d399';
    ctx.fill();
  }

  ctx.globalAlpha = 1;
}

// ─────────────────────────────────────────────────────────────────────────────
// Stage pill progress indicator
// ─────────────────────────────────────────────────────────────────────────────

function StagePills({ stage, total }: { stage: number; total: number }) {
  return (
    <div className="flex items-center gap-1.5">
      {Array.from({ length: total }, (_, i) => i + 1).map(n => (
        <div
          key={n}
          className={`rounded-full transition-all duration-300 ${
            n === stage ? 'w-6 h-1.5 bg-purple-500' : n < stage ? 'w-1.5 h-1.5 bg-slate-600' : 'w-1.5 h-1.5 bg-slate-800'
          }`}
        />
      ))}
    </div>
  );
}

function StageButton({ onClick, label, variant = 'default' }: { onClick: () => void; label: string; variant?: 'default' | 'primary' }) {
  if (variant === 'primary') {
    return (
      <button
        onClick={onClick}
        className="w-full bg-purple-700 hover:bg-purple-600 text-white font-semibold rounded-lg px-4 py-2.5 transition-colors text-sm"
      >
        {label}
      </button>
    );
  }
  return (
    <button
      onClick={onClick}
      className="w-full border border-purple-700 hover:bg-purple-900/30 text-purple-300 font-semibold rounded-lg px-4 py-2 transition-colors text-sm"
    >
      {label}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main export
// ─────────────────────────────────────────────────────────────────────────────

export function Module3Canyon({ onContinue }: { onContinue: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);

  const [stage, setStage] = useState<1 | 2 | 3 | 4 | 5>(1);
  const advance = () => setStage(s => Math.min(s + 1, 5) as 1 | 2 | 3 | 4 | 5);

  // Stage 2 transition progress
  const transProgressRef = useRef(0);

  // Stage 4 state
  const [lastPush, setLastPush] = useState<'floor' | 'wall' | null>(null);
  const [floorPushDir, setFloorPushDir] = useState<1 | -1 | null>(null);
  const floorPushRef = useRef<1 | -1 | null>(null);

  // Stage 5 state
  const [noiseOn, setNoiseOn] = useState(false);
  const [noiseLevel, setNoiseLevel] = useState(0.025);
  const noiseRef = useRef(noiseLevel);
  const noiseOnRef = useRef(noiseOn);
  noiseRef.current = noiseLevel;
  noiseOnRef.current = noiseOn;

  const trailRef = useRef<number[]>([]);
  const driftRef = useRef(0);
  const [driftDisplay, setDriftDisplay] = useState(0);

  const { net, tick, perturbBump, setNoiseLevel: storeSetNoise } = useNetworkStore();

  // Keep noise level in store in sync with stage 5
  useEffect(() => {
    if (stage === 5) {
      storeSetNoise(noiseOn ? noiseLevel : 0);
    } else {
      storeSetNoise(0);
    }
  }, [stage, noiseOn, noiseLevel, storeSetNoise]);

  const targetAmpRef = useRef(net.bumpAmplitude || 2);
  useEffect(() => {
    if (net.bumpAmplitude > 0.1) targetAmpRef.current = net.bumpAmplitude;
  }, []); // eslint-disable-line

  // ── Stage-aware draw ──────────────────────────────────────────────────────
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const W = canvas.width, H = canvas.height;
    const { net: n } = useNetworkStore.getState();

    if (stage === 1) {
      fillBg(ctx, W, H);
      // Draw neural ring
      const cx = W / 2, cy = H / 2, R = Math.min(W, H) * 0.38;
      drawNeuralRing(ctx, cx, cy, R, n.u, n.x);

      // Decoded angle spoke
      const da = n.decodedAngle - PI / 2;
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(52,211,153,0.5)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(da) * R, cy + Math.sin(da) * R);
      ctx.stroke();
      ctx.setLineDash([]);

      // Center label
      ctx.fillStyle = '#34d399';
      ctx.font = '11px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`${(n.decodedAngle * 180 / PI).toFixed(1)}°`, cx, cy + 4);
      ctx.textAlign = 'left';

    } else if (stage === 2) {
      fillBg(ctx, W, H);
      const t = transProgressRef.current; // 0→1

      const half = W / 2;

      // Left half: neural ring (fades out)
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, half, H);
      ctx.clip();
      const ringAlpha = Math.max(0, 1 - t * 1.5);
      const cx = half / 2, cy = H / 2, R = Math.min(half, H) * 0.36;
      drawNeuralRing(ctx, cx, cy, R, n.u, n.x, ringAlpha);
      if (ringAlpha > 0) {
        ctx.fillStyle = `rgba(100,116,139,${ringAlpha * 0.6})`;
        ctx.font = '11px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('neural ring', cx, H - 18);
        ctx.textAlign = 'left';
      }
      ctx.restore();

      // Divider
      ctx.strokeStyle = `rgba(30,58,95,${0.3 + t * 0.3})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(half, 20); ctx.lineTo(half, H - 20);
      ctx.stroke();

      // Right half: canyon (fades in)
      ctx.save();
      ctx.beginPath();
      ctx.rect(half, 0, half, H);
      ctx.clip();
      const canyonAlpha = Math.min(1, t * 1.4);
      // Offset the canyon into the right half
      ctx.translate(half, 0);
      drawCanyonLandscape(ctx, half, H, n.decodedAngle, n.bumpAmplitude, targetAmpRef.current, {
        showLabels: canyonAlpha > 0.7,
        transitionAlpha: canyonAlpha,
      });
      ctx.restore();

      // Arrow in center at midpoint
      if (t > 0.3 && t < 0.85) {
        const arrowAlpha = Math.sin((t - 0.3) / 0.55 * PI);
        ctx.fillStyle = `rgba(148,163,184,${arrowAlpha * 0.8})`;
        ctx.font = 'bold 22px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('→', half, H / 2 + 7);
        ctx.textAlign = 'left';
      }

      if (t > 0.6) {
        ctx.fillStyle = `rgba(100,116,139,${(t - 0.6) * 2 * 0.6})`;
        ctx.font = '11px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('attractor canyon', half + half / 2, H - 18);
        ctx.textAlign = 'left';
      }

    } else {
      // Stages 3–5: full canyon
      fillBg(ctx, W, H);
      drawCanyonLandscape(ctx, W, H, n.decodedAngle, n.bumpAmplitude, targetAmpRef.current, {
        showLabels: true,
        showFloorArrow: stage === 4 ? floorPushRef.current : null,
        trailAngles: stage === 5 ? trailRef.current : [],
        glowBall: stage === 5 && noiseOnRef.current,
      });
    }
  }, [stage]); // eslint-disable-line

  // ── Animation loop ────────────────────────────────────────────────────────
  useEffect(() => {
    let running = true;
    let frame = 0;
    trailRef.current = [];
    // Reset transition progress when entering stage 2
    if (stage === 2) transProgressRef.current = 0;

    const loop = () => {
      if (!running) return;

      // Advance stage 2 transition
      if (stage === 2) {
        transProgressRef.current = Math.min(1, transProgressRef.current + 0.008);
      }

      tick(DT);
      frame++;

      // Stage 5: trail + drift
      if (stage === 5) {
        const { net: n } = useNetworkStore.getState();
        trailRef.current.push(n.decodedAngle);
        if (trailRef.current.length > 80) trailRef.current = trailRef.current.slice(-80);

        if (frame % 12 === 0 && trailRef.current.length > 1) {
          const trail = trailRef.current;
          let totalDrift = 0;
          for (let i = 1; i < trail.length; i++) {
            totalDrift += Math.abs(dist(trail[i] - trail[i - 1]));
          }
          driftRef.current = totalDrift / trail.length * 180 / PI;
          setDriftDisplay(driftRef.current);
        }
      }

      draw();
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => { running = false; cancelAnimationFrame(rafRef.current); };
  }, [stage, draw, tick]);

  // ── Perturbations ─────────────────────────────────────────────────────────
  const pushFloor = (dir: 1 | -1) => {
    perturbBump(dir * 0.35, 1.0);
    floorPushRef.current = dir;
    setFloorPushDir(dir);
    setLastPush('floor');
    setTimeout(() => { floorPushRef.current = null; setFloorPushDir(null); }, 600);
  };

  const pushWall = (scale: number) => {
    perturbBump(0, scale);
    setLastPush('wall');
  };

  // ── Stage narrative text ──────────────────────────────────────────────────
  const stageQuestion: Record<number, string> = {
    1: 'Why does this activity pattern remain stable?',
    2: 'This is the same system — represented differently.',
    3: 'The canyon floor is flat. The walls are steep.',
    4: 'Position shifts persist. Shape perturbations decay.',
    5: 'Noise causes the ball to drift along the flat floor.',
  };
  const stageSub: Record<number, string> = {
    1: 'The bump is a localized pattern of neural activity. Recurrent connections hold it in place.',
    2: "The bump's position maps to a location on the canyon floor. Its shape maps to height on the wall.",
    3: 'Moving along the floor costs no energy — position is a free variable. Climbing the wall takes effort, and the ball rolls back.',
    4: 'Push the ball sideways (floor): it stays wherever it lands. Push it up or down (wall): it snaps back to the floor.',
    5: 'Each noise kick nudges the ball along the floor. Over time, this accumulates into memory drift.',
  };

  const canvasW = stage === 2 ? 620 : 540;
  const canvasH = 380;

  return (
    <div className="flex flex-col h-full">
      <NarrativeStrip
        moduleNum={3}
        question={stageQuestion[stage]}
        subtitle={stageSub[stage]}
      />

      <div className="flex flex-1 overflow-hidden">
        {/* Main canvas */}
        <div className="flex-1 flex items-center justify-center bg-slate-950 p-4">
          <canvas
            ref={canvasRef}
            width={canvasW}
            height={canvasH}
            className="rounded-xl border border-slate-800 shadow-2xl"
          />
        </div>

        {/* Right panel */}
        <div className="w-72 flex flex-col border-l border-white/10 bg-slate-900/50 overflow-y-auto">
          <div className="p-5 space-y-4 flex-1">
            {/* Stage pills */}
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono text-slate-600 uppercase tracking-widest">Stage</span>
              <StagePills stage={stage} total={5} />
            </div>

            {/* Stage-specific description */}
            {stage === 1 && (
              <div className="space-y-3">
                <p className="text-sm text-slate-400 leading-relaxed">
                  The activity bump persists because recurrent excitatory connections
                  reinforce active neurons. Divisive inhibition keeps the total activity bounded.
                </p>
                <p className="text-sm text-slate-400 leading-relaxed">
                  But why can the bump sit at <em>any</em> angle equally well?
                  And why can it shift, but not dissolve?
                </p>
              </div>
            )}

            {stage === 2 && (
              <div className="space-y-3">
                <p className="text-sm text-slate-400 leading-relaxed">
                  Each possible bump position corresponds to a point on the
                  canyon floor. Moving along the floor is effortless — the network
                  accepts any position.
                </p>
                <p className="text-sm text-slate-400 leading-relaxed">
                  The canyon walls encode how far the bump's <em>shape</em> deviates
                  from its ideal profile.
                </p>
              </div>
            )}

            {stage === 3 && (
              <div className="space-y-3">
                <div className="rounded-lg bg-slate-800/50 border border-slate-700 p-3 space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">Decoded position</span>
                    <span className="font-mono text-emerald-400">{(net.decodedAngle * 180 / PI).toFixed(1)}°</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">Bump amplitude</span>
                    <span className="font-mono text-purple-400">{net.bumpAmplitude.toFixed(2)}</span>
                  </div>
                </div>
                <p className="text-sm text-slate-400 leading-relaxed">
                  The ball sits on the canyon floor. Its horizontal position is the
                  decoded memory. Its height encodes shape distortion — currently near zero.
                </p>
              </div>
            )}

            {stage === 4 && (
              <div className="space-y-3">
                <div className="rounded-lg bg-slate-800/50 border border-slate-700 p-3 space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">Decoded position</span>
                    <span className="font-mono text-emerald-400">{(net.decodedAngle * 180 / PI).toFixed(1)}°</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">Last push</span>
                    <span className={`font-mono text-xs ${lastPush === 'floor' ? 'text-emerald-400' : lastPush === 'wall' ? 'text-amber-400' : 'text-slate-600'}`}>
                      {lastPush === 'floor' ? `floor ${floorPushDir === 1 ? '→' : '←'} (position)` : lastPush === 'wall' ? 'wall ↑↓ (shape)' : '—'}
                    </span>
                  </div>
                </div>
                <p className="text-sm text-slate-400 leading-relaxed">
                  <span className="text-emerald-400 font-medium">Floor pushes</span> move the ball to a new
                  position — and it stays there. No restoring force along the manifold.
                </p>
                <p className="text-sm text-slate-400 leading-relaxed">
                  <span className="text-amber-400 font-medium">Wall pushes</span> distort the bump's shape —
                  the ball climbs the wall, then rolls back to the floor.
                </p>
              </div>
            )}

            {stage === 5 && (
              <div className="space-y-3">
                <div className="rounded-lg bg-slate-800/50 border border-slate-700 p-3 space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">Decoded position</span>
                    <span className="font-mono text-emerald-400">{(net.decodedAngle * 180 / PI).toFixed(1)}°</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">Drift rate</span>
                    <span className={`font-mono ${driftDisplay > 0.3 ? 'text-amber-400' : 'text-slate-400'}`}>
                      {driftDisplay.toFixed(3)}°/step
                    </span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">Noise level</span>
                    <span className="font-mono text-slate-400">{noiseOn ? noiseLevel.toFixed(3) : 'off'}</span>
                  </div>
                </div>
                <p className="text-sm text-slate-400 leading-relaxed">
                  Because the floor is flat, there is no restoring force to resist drift.
                  Each random kick accumulates. Longer delays → more total drift → bigger recall error.
                </p>
                <div className="text-left bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Key insight  </span>
                  <span className="text-xs text-slate-400">
                    If neural states drift over time, how does that shape behavior?
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Controls */}
          <div className="p-5 border-t border-white/10 space-y-3">
            {stage === 4 && (
              <>
                <h3 className="text-xs uppercase tracking-widest text-slate-500">Perturbations</h3>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => pushFloor(-1)}
                    className="bg-slate-800 hover:bg-slate-700 text-emerald-300 text-sm font-semibold rounded-lg py-2 transition-colors"
                  >
                    ← Floor
                  </button>
                  <button
                    onClick={() => pushFloor(1)}
                    className="bg-slate-800 hover:bg-slate-700 text-emerald-300 text-sm font-semibold rounded-lg py-2 transition-colors"
                  >
                    Floor →
                  </button>
                  <button
                    onClick={() => pushWall(1.9)}
                    className="bg-violet-900/40 hover:bg-violet-800/50 text-violet-300 text-sm font-semibold rounded-lg py-2 transition-colors"
                  >
                    ↑ Wall up
                  </button>
                  <button
                    onClick={() => pushWall(0.35)}
                    className="bg-violet-900/40 hover:bg-violet-800/50 text-violet-300 text-sm font-semibold rounded-lg py-2 transition-colors"
                  >
                    ↓ Wall down
                  </button>
                </div>
              </>
            )}

            {stage === 5 && (
              <>
                <button
                  onClick={() => setNoiseOn(v => !v)}
                  className={`w-full text-sm font-semibold rounded-lg py-2 transition-colors ${
                    noiseOn ? 'bg-amber-700/70 text-amber-100' : 'border border-slate-600 text-slate-300'
                  }`}
                >
                  Noise {noiseOn ? 'ON ◉' : 'OFF ○'}
                </button>
                {noiseOn && (
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs text-slate-500">
                      <span>Noise strength</span>
                      <span className="font-mono">{noiseLevel.toFixed(3)}</span>
                    </div>
                    <input
                      type="range" min={0.005} max={0.06} step={0.005}
                      value={noiseLevel}
                      onChange={e => setNoiseLevel(parseFloat(e.target.value))}
                      className="w-full accent-amber-500"
                    />
                  </div>
                )}
              </>
            )}

            {stage < 5 ? (
              <StageButton
                onClick={advance}
                variant="primary"
                label={
                  stage === 1 ? 'See the energy landscape →' :
                  stage === 2 ? 'Explore the canyon →' :
                  stage === 3 ? 'Try pushing the ball →' :
                  'Add noise and watch it drift →'
                }
              />
            ) : (
              <button
                onClick={onContinue}
                className="w-full border border-purple-700 hover:bg-purple-900/30 text-purple-300 font-semibold rounded-lg px-4 py-2 transition-colors text-sm"
              >
                Show how drift becomes memory error →
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
