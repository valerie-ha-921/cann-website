/**
 * LandingPage.tsx
 *
 * 5-beat narrative landing page. Each beat answers a question created by the
 * previous one, building progressive necessity for the CANN explanation.
 *
 * Beat 1 — Experience the ODR task (user clicks their recalled location)
 * Beat 2 — Memory is not a static file (active vs passive)
 * Beat 3 — Continuous vs categorical memory (drag interaction)
 * Beat 4 — Drift and noise (live CANN simulation with sliders)
 * Beat 5 — Recurrent neural dynamics (bump formation, inhibition toggle)
 *         → CTA: "Explore the attractor manifold."
 */

import { useState, useEffect, useRef } from 'react';
import { dist as periodicDist } from '../simulation/dynamics';
import {
  createNetwork,
  warmStart,
  stepNetwork,
  applyInput,
  removeInput,
} from '../simulation/engine';

const PI = Math.PI;

// ─────────────────────────────────────────────────────────────────────────────
// Shared canvas drawing helpers
// ─────────────────────────────────────────────────────────────────────────────

function fillBg(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.fillStyle = '#050d18';
  ctx.fillRect(0, 0, w, h);
}

function drawRingCircle(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, R: number,
  color = '#1e3a5f', lineWidth = 1.5
) {
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, 2 * PI);
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.stroke();
}

function drawTicks(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, R: number
) {
  for (let deg = 0; deg < 360; deg += 30) {
    const a = (deg * PI) / 180 - PI / 2;
    const inner = R - (deg % 90 === 0 ? 12 : 6);
    ctx.beginPath();
    ctx.strokeStyle = deg % 90 === 0 ? '#1e3a5f' : '#0f2340';
    ctx.lineWidth = 1;
    ctx.moveTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner);
    ctx.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
    ctx.stroke();
  }
}

/** Draw a dot on the ring at `angle` (radians from 12-o'clock, CW). */
function drawAngleDot(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, R: number,
  angle: number,
  radius: number,
  color: string,
  glow = false
) {
  const a = angle - PI / 2;
  const x = cx + Math.cos(a) * R;
  const y = cy + Math.sin(a) * R;
  if (glow) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, radius * 4);
    g.addColorStop(0, color.includes('rgba') ? color : color + 'aa');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.beginPath();
    ctx.arc(x, y, radius * 4, 0, 2 * PI);
    ctx.fillStyle = g;
    ctx.fill();
  }
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, 2 * PI);
  ctx.fillStyle = color;
  ctx.fill();
  return { x, y };
}

function drawFixation(ctx: CanvasRenderingContext2D, cx: number, cy: number, color = '#334155') {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(cx - 9, cy); ctx.lineTo(cx + 9, cy);
  ctx.moveTo(cx, cy - 9); ctx.lineTo(cx, cy + 9);
  ctx.stroke();
}

/** Convert a canvas mouse event to an angle in (-π, π] measured from 12-o'clock CW. */
function mouseToAngle(e: React.MouseEvent<HTMLCanvasElement>, cx: number, cy: number): number {
  const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
  const dx = e.clientX - rect.left - cx;
  const dy = e.clientY - rect.top - cy;
  return Math.atan2(dx, -dy); // 0 = top, CW positive
}

// ─────────────────────────────────────────────────────────────────────────────
// Progress indicator
// ─────────────────────────────────────────────────────────────────────────────

function ProgressDots({ beat, total, onJump }: { beat: number; total: number; onJump: (n: number) => void }) {
  return (
    <div className="flex gap-2 items-center">
      {Array.from({ length: total }, (_, i) => i + 1).map(d => (
        <button
          key={d}
          onClick={() => onJump(d)}
          className={`rounded-full transition-all duration-300 ${
            d === beat
              ? 'w-5 h-1.5 bg-blue-500'
              : d < beat
              ? 'w-1.5 h-1.5 bg-slate-600'
              : 'w-1.5 h-1.5 bg-slate-800'
          }`}
        />
      ))}
    </div>
  );
}

function BeatLabel({ text }: { text: string }) {
  return (
    <div className="text-xs font-mono text-slate-600 uppercase tracking-widest">{text}</div>
  );
}

function ContinueButton({ onClick, label = 'Continue →' }: { onClick: () => void; label?: string }) {
  return (
    <button
      onClick={onClick}
      className="px-6 py-2.5 bg-slate-900 hover:bg-slate-800 border border-slate-700 hover:border-slate-600 text-slate-300 rounded-lg text-sm font-medium transition-all"
    >
      {label}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Beat 0 — Hero Screen
// ─────────────────────────────────────────────────────────────────────────────

function Beat0Hero({ onBegin }: { onBegin: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const frameRef = useRef(0);

  const SIZE = 440;
  const CX = SIZE / 2, CY = SIZE / 2;
  const N_NEURONS = 36;
  const R_RING = 160;

  useEffect(() => {
    let running = true;
    const loop = () => {
      if (!running) return;
      frameRef.current++;
      const t = frameRef.current;
      const canvas = canvasRef.current;
      if (!canvas) { rafRef.current = requestAnimationFrame(loop); return; }
      const ctx = canvas.getContext('2d')!;
      ctx.clearRect(0, 0, SIZE, SIZE);

      // Ring outline
      ctx.beginPath();
      ctx.arc(CX, CY, R_RING, 0, 2 * PI);
      ctx.strokeStyle = 'rgba(30,58,95,0.5)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Rotating bump
      const bumpCenter = (t * 0.006) % (2 * PI);

      for (let i = 0; i < N_NEURONS; i++) {
        const angle = (i / N_NEURONS) * 2 * PI - PI / 2;
        const nx = CX + Math.cos(angle) * R_RING;
        const ny = CY + Math.sin(angle) * R_RING;

        // Wrapped distance to bump center
        let d = (angle + PI / 2) - bumpCenter;
        while (d > PI) d -= 2 * PI;
        while (d < -PI) d += 2 * PI;
        const activity = Math.exp(-(d * d) / 0.45);

        // Glow
        if (activity > 0.15) {
          const grd = ctx.createRadialGradient(nx, ny, 0, nx, ny, 22 * activity);
          grd.addColorStop(0, `rgba(59,130,246,${activity * 0.35})`);
          grd.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.beginPath();
          ctx.arc(nx, ny, 22 * activity, 0, 2 * PI);
          ctx.fillStyle = grd;
          ctx.fill();
        }

        // Neuron dot
        const dotR = 3.5 + activity * 6;
        ctx.beginPath();
        ctx.arc(nx, ny, dotR, 0, 2 * PI);
        ctx.fillStyle = `rgba(59,130,${Math.round(180 + activity * 75)},${0.2 + activity * 0.8})`;
        ctx.fill();
      }

      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => { running = false; cancelAnimationFrame(rafRef.current); };
  }, []);

  return (
    <div className="relative flex flex-col items-center justify-center h-full select-none overflow-hidden">
      {/* Animated ring in background */}
      <canvas
        ref={canvasRef}
        width={SIZE}
        height={SIZE}
        className="absolute opacity-25 pointer-events-none"
      />
      {/* Foreground content */}
      <div className="relative z-10 flex flex-col items-center gap-7 text-center max-w-lg px-8">
        <div className="text-xs font-mono text-slate-600 uppercase tracking-widest">
          Interactive explainer · Computational neuroscience
        </div>
        <h1 className="text-4xl font-light text-white tracking-wide leading-tight">
          Continuous Attractor<br />Neural Networks
        </h1>
        <p className="text-base text-slate-400 leading-relaxed">
          How does the brain hold a precise location in mind — with no external input —
          across a multi-second delay?
        </p>
        <button
          onClick={onBegin}
          className="mt-1 px-10 py-3.5 bg-blue-700 hover:bg-blue-600 active:bg-blue-800 text-white font-semibold rounded-lg text-sm transition-colors shadow-2xl shadow-blue-950/80 tracking-wide"
        >
          Begin →
        </button>
        <p className="text-xs text-slate-700">Seven interactive beats · ~8 min</p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Beat 1 — Why Continuous Memory Matters (Scientific Motivation)
// ─────────────────────────────────────────────────────────────────────────────

const SCIENCE_EXAMPLES = [
  { label: 'Head direction', sub: 'Where am I facing?', color: '#60a5fa', bump: 1.1 },
  { label: 'Orientation tuning', sub: 'What angle is this edge?', color: '#a78bfa', bump: 2.2 },
  { label: 'Motion direction', sub: 'Which way is it moving?', color: '#34d399', bump: 3.5 },
  { label: 'Eye position', sub: 'Where am I looking?', color: '#f472b6', bump: 4.8 },
  { label: 'Spatial navigation', sub: 'Where am I in space?', color: '#fb923c', bump: 0.4 },
  { label: 'Object location', sub: 'Where did I see it last?', color: '#fbbf24', bump: 5.6 },
];

function Beat1Science({ onComplete }: { onComplete: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const frameRef = useRef(0);
  const bumpRef = useRef(SCIENCE_EXAMPLES[0].bump);
  const [exampleIdx, setExampleIdx] = useState(0);

  const SIZE = 280;

  useEffect(() => {
    const CX = SIZE / 2, CY = SIZE / 2;
    const R = 100;
    const N = 32;
    const FRAMES_PER = 180;  // frames each example is held
    const XFADE = 55;        // frames to crossfade between examples (~0.9s at 60fps)
    const NE = SCIENCE_EXAMPLES.length;
    const smooth = (t: number) => t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);

    let running = true;
    const loop = () => {
      if (!running) return;
      frameRef.current++;
      const f = frameRef.current;

      const t = f / FRAMES_PER;
      const currIdxRaw = Math.floor(t);
      const currIdx = currIdxRaw % NE;
      const prevIdx = ((currIdxRaw - 1) % NE + NE) % NE;
      const tInExample = (t % 1) * FRAMES_PER;

      // blend: 0 = fully outgoing, 1 = fully incoming
      const blend = smooth(tInExample / XFADE);
      // Only show outgoing layer after the very first appearance
      const showPrev = currIdxRaw > 0 && blend < 1;

      setExampleIdx(currIdx);

      // Bump drifts continuously — never resets at example boundaries
      bumpRef.current += 0.008;
      const bumpAngle = bumpRef.current;

      const exCurr = SCIENCE_EXAMPLES[currIdx];
      const exPrev = SCIENCE_EXAMPLES[prevIdx];

      const canvas = canvasRef.current;
      if (!canvas) { rafRef.current = requestAnimationFrame(loop); return; }
      const ctx = canvas.getContext('2d')!;
      fillBg(ctx, SIZE, SIZE);

      // One-time scene fade-in on first load
      const sceneFade = Math.min(1, f / 40);

      // Ring stays visually stable throughout
      ctx.globalAlpha = sceneFade;
      ctx.beginPath();
      ctx.arc(CX, CY, R, 0, 2 * PI);
      ctx.strokeStyle = 'rgba(30,58,95,0.7)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Draw one example's neurons at a given global opacity
      const drawLayer = (ex: typeof SCIENCE_EXAMPLES[0], alpha: number) => {
        if (alpha <= 0.005) return;
        ctx.globalAlpha = sceneFade * alpha;
        for (let i = 0; i < N; i++) {
          const angle = (i / N) * 2 * PI - PI / 2;
          const nx = CX + Math.cos(angle) * R;
          const ny = CY + Math.sin(angle) * R;

          let d = (angle + PI / 2) - bumpAngle;
          while (d > PI) d -= 2 * PI;
          while (d < -PI) d += 2 * PI;
          const act = Math.exp(-(d * d) / 0.5);

          if (act > 0.12) {
            const grd = ctx.createRadialGradient(nx, ny, 0, nx, ny, 18 * act);
            grd.addColorStop(0, ex.color + Math.round(act * 120).toString(16).padStart(2, '0'));
            grd.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.beginPath(); ctx.arc(nx, ny, 18 * act, 0, 2 * PI);
            ctx.fillStyle = grd; ctx.fill();
          }

          const dotR = 3 + act * 5.5;
          ctx.beginPath(); ctx.arc(nx, ny, dotR, 0, 2 * PI);
          ctx.fillStyle = act > 0.1
            ? ex.color + Math.round(40 + act * 215).toString(16).padStart(2, '0')
            : 'rgba(20,40,70,0.5)';
          ctx.fill();
        }
      };

      // Outgoing layer fades out while incoming fades in
      if (showPrev) drawLayer(exPrev, 1 - blend);
      drawLayer(exCurr, blend);

      // Center labels mirror the same crossfade
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      if (showPrev) {
        ctx.globalAlpha = sceneFade * (1 - blend);
        ctx.fillStyle = exPrev.color;
        ctx.font = 'bold 11px monospace';
        ctx.fillText(exPrev.label, CX, CY - 10);
        ctx.fillStyle = '#475569';
        ctx.font = '10px monospace';
        ctx.fillText(exPrev.sub, CX, CY + 10);
      }
      ctx.globalAlpha = sceneFade * blend;
      ctx.fillStyle = exCurr.color;
      ctx.font = 'bold 11px monospace';
      ctx.fillText(exCurr.label, CX, CY - 10);
      ctx.fillStyle = '#475569';
      ctx.font = '10px monospace';
      ctx.fillText(exCurr.sub, CX, CY + 10);

      ctx.globalAlpha = 1;
      ctx.textBaseline = 'alphabetic';
      ctx.textAlign = 'left';

      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => { running = false; cancelAnimationFrame(rafRef.current); };
  }, []);

  return (
    <div className="flex flex-col items-center justify-center h-full gap-6 px-8 select-none">
      <BeatLabel text="Beat 1 · Why continuous memory matters" />

      <div className="flex gap-12 items-center">
        {/* Animated ring */}
        <div className="flex flex-col items-center gap-2">
          <canvas ref={canvasRef} width={SIZE} height={SIZE} className="rounded-xl" />
          {/* Example dots */}
          <div className="flex gap-1.5">
            {SCIENCE_EXAMPLES.map((ex, i) => (
              <div
                key={ex.label}
                className="w-1.5 h-1.5 rounded-full transition-all duration-300"
                style={{ backgroundColor: i === exampleIdx ? ex.color : '#1e3a5f' }}
              />
            ))}
          </div>
        </div>

        {/* Text panel */}
        <div className="flex flex-col gap-5 max-w-xs">
          <p className="text-2xl text-slate-100 font-light leading-snug">
            Brains represent more than categories.
          </p>
          <div className="space-y-2 text-sm text-slate-400 leading-relaxed">
            <p>
              Head direction. Gaze angle. Motion trajectory. Remembered location.
              These are all <em className="text-slate-300">continuous variables</em> — they can
              take infinitely many values.
            </p>
            <p>
              The brain cannot encode them as discrete labels. It must maintain a
              precise internal representation that can sit anywhere along a continuum.
            </p>
          </div>
          <div className="bg-slate-900/60 border border-slate-800 rounded-lg px-4 py-3 text-sm text-slate-300 italic leading-relaxed">
            "How does the brain stably represent values that can vary continuously — with no external input?"
          </div>
        </div>
      </div>

      <ContinueButton onClick={onComplete} label="Experience the problem →" />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Beat 2 — Experience the ODR Task  (with Pointer Lock during cue + delay)
// ─────────────────────────────────────────────────────────────────────────────

type B2Phase = 'waitClick' | 'fixation' | 'cue' | 'delay' | 'response' | 'result';

function Beat2ODR({ onComplete }: { onComplete: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const phaseRef = useRef<B2Phase>('waitClick');
  const [phase, setPhase] = useState<B2Phase>('waitClick');
  const [cueAngle] = useState(() => (Math.random() * 2 - 1) * PI);
  const [responseAngle, setResponseAngle] = useState<number | null>(null);
  const [pointerLocked, setPointerLocked] = useState(false);
  const rafRef = useRef<number>(0);
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const SIZE = 420;
  const CX = SIZE / 2, CY = SIZE / 2;
  const RING_R = 160;

  // Track pointer lock changes
  useEffect(() => {
    const onChange = () => {
      setPointerLocked(document.pointerLockElement === canvasRef.current);
    };
    document.addEventListener('pointerlockchange', onChange);
    document.addEventListener('pointerlockerror', onChange);
    return () => {
      document.removeEventListener('pointerlockchange', onChange);
      document.removeEventListener('pointerlockerror', onChange);
    };
  }, []);

  // Release lock when entering response phase
  useEffect(() => {
    if (phase === 'response' && document.pointerLockElement) {
      document.exitPointerLock();
    }
  }, [phase]);

  // Cleanup timeouts and lock on unmount
  useEffect(() => {
    return () => {
      timeoutsRef.current.forEach(clearTimeout);
      if (document.pointerLockElement === canvasRef.current) {
        document.exitPointerLock();
      }
    };
  }, []);

  const startTrial = () => {
    // Clear any existing timeouts
    timeoutsRef.current.forEach(clearTimeout);
    timeoutsRef.current = [];

    // Request pointer lock (requires user gesture — canvas click satisfies this)
    try { canvasRef.current?.requestPointerLock(); } catch (_) { /* fallback: cursor just hidden via CSS */ }

    phaseRef.current = 'fixation';
    setPhase('fixation');

    const t1 = setTimeout(() => {
      phaseRef.current = 'cue';
      setPhase('cue');

      const t2 = setTimeout(() => {
        phaseRef.current = 'delay';
        setPhase('delay');

        const t3 = setTimeout(() => {
          phaseRef.current = 'response';
          setPhase('response');
          if (document.pointerLockElement) document.exitPointerLock();
        }, 2200);
        timeoutsRef.current.push(t3);
      }, 650);
      timeoutsRef.current.push(t2);
    }, 800);
    timeoutsRef.current.push(t1);
  };

  // Canvas draw loop
  useEffect(() => {
    let running = true;
    const draw = () => {
      if (!running) return;
      const canvas = canvasRef.current;
      if (!canvas) { rafRef.current = requestAnimationFrame(draw); return; }
      const ctx = canvas.getContext('2d')!;
      const p = phaseRef.current;

      fillBg(ctx, SIZE, SIZE);
      drawTicks(ctx, CX, CY, RING_R);
      drawRingCircle(ctx, CX, CY, RING_R, '#1a2f4a');
      drawFixation(ctx, CX, CY, p === 'response' ? '#3b82f6' : '#2d3f52');

      if (p === 'waitClick') {
        ctx.fillStyle = 'rgba(148,163,184,0.5)';
        ctx.font = '12px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('Click to begin trial', CX, CY + 40);
        ctx.textAlign = 'left';
      }

      if (p === 'cue') {
        drawAngleDot(ctx, CX, CY, RING_R, cueAngle, 11, '#3b82f6', true);
      }

      // During locked phases show centered fixation indicator
      if ((p === 'cue' || p === 'delay') && pointerLocked) {
        ctx.beginPath();
        ctx.arc(CX, CY, 18, 0, 2 * PI);
        ctx.strokeStyle = 'rgba(59,130,246,0.25)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      if (p === 'response') {
        const grad = ctx.createRadialGradient(CX, CY, RING_R - 25, CX, CY, RING_R + 25);
        grad.addColorStop(0, 'rgba(59,130,246,0.04)');
        grad.addColorStop(0.5, 'rgba(59,130,246,0.08)');
        grad.addColorStop(1, 'rgba(59,130,246,0.04)');
        ctx.beginPath();
        ctx.arc(CX, CY, RING_R + 25, 0, 2 * PI);
        ctx.arc(CX, CY, RING_R - 25, 0, 2 * PI, true);
        ctx.fillStyle = grad; ctx.fill();
      }

      if (p === 'result' && responseAngle !== null) {
        drawAngleDot(ctx, CX, CY, RING_R, cueAngle, 9, 'rgba(59,130,246,0.45)');
        drawAngleDot(ctx, CX, CY, RING_R, responseAngle, 11, '#34d399', true);
        const ca = cueAngle - PI / 2, ra = responseAngle - PI / 2;
        const err = periodicDist(responseAngle - cueAngle);
        ctx.beginPath();
        ctx.arc(CX, CY, RING_R * 0.72, ca, ra, err < 0);
        ctx.strokeStyle = 'rgba(251,191,36,0.45)'; ctx.lineWidth = 2.5; ctx.stroke();

        const { x: cx2, y: cy2 } = drawAngleDot(ctx, CX, CY, RING_R, cueAngle, 0, 'transparent');
        const { x: rx, y: ry } = drawAngleDot(ctx, CX, CY, RING_R, responseAngle, 0, 'transparent');
        ctx.font = '10px monospace';
        ctx.fillStyle = 'rgba(96,165,250,0.7)'; ctx.textAlign = 'center';
        ctx.fillText('true', cx2, cy2 - 18);
        ctx.fillStyle = '#34d399';
        ctx.fillText('recalled', rx, ry - 18);
        ctx.textAlign = 'left';
      }

      rafRef.current = requestAnimationFrame(draw);
    };
    rafRef.current = requestAnimationFrame(draw);
    return () => { running = false; cancelAnimationFrame(rafRef.current); };
  }, [phase, cueAngle, responseAngle, pointerLocked, CX, CY]);

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (phase === 'waitClick') { startTrial(); return; }
    if (phase !== 'response') return;
    const angle = mouseToAngle(e, CX, CY);
    setResponseAngle(angle);
    phaseRef.current = 'result';
    setPhase('result');
  };

  const errorDeg = responseAngle !== null
    ? Math.abs(periodicDist(responseAngle - cueAngle) * 180 / PI)
    : null;

  const phaseMessages: Record<B2Phase, string> = {
    waitClick: '',
    fixation: 'Fixate on the center…',
    cue: 'Remember this location.',
    delay: 'Hold it in mind…',
    response: 'Click where the cue appeared.',
    result: '',
  };

  // Cursor: hidden during locked cue/delay, crosshair on response
  const cursorClass = (phase === 'cue' || phase === 'delay')
    ? 'cursor-none'
    : phase === 'response' ? 'cursor-crosshair' : 'cursor-pointer';

  return (
    <div className="flex flex-col items-center justify-center h-full gap-5 select-none">
      <BeatLabel text="Beat 2 · Experience the task" />

      <canvas
        ref={canvasRef}
        width={SIZE}
        height={SIZE}
        onClick={handleCanvasClick}
        className={cursorClass}
      />

      {phase !== 'result' && (
        <p className="text-sm text-slate-500 font-mono h-5 tracking-wide">
          {phaseMessages[phase]}
        </p>
      )}
      {(phase === 'cue' || phase === 'delay') && (
        <p className="text-xs text-slate-700 font-mono tracking-wide">
          cursor locked — fixate on center
        </p>
      )}

      {phase === 'result' && responseAngle !== null && (
        <div className="flex flex-col items-center gap-5 max-w-sm text-center">
          <div className="flex gap-6">
            <div>
              <div className="text-xs text-slate-600 uppercase tracking-widest mb-1">True cue</div>
              <div className="text-xl font-mono text-blue-400">{(cueAngle * 180 / PI).toFixed(1)}°</div>
            </div>
            <div>
              <div className="text-xs text-slate-600 uppercase tracking-widest mb-1">Recalled</div>
              <div className="text-xl font-mono text-emerald-400">{(responseAngle * 180 / PI).toFixed(1)}°</div>
            </div>
            <div>
              <div className="text-xs text-slate-600 uppercase tracking-widest mb-1">Error</div>
              <div className={`text-xl font-mono ${errorDeg! > 15 ? 'text-amber-400' : 'text-emerald-400'}`}>
                {errorDeg!.toFixed(1)}°
              </div>
            </div>
          </div>
          <p className="text-base text-slate-300 italic leading-relaxed">
            "How did your brain preserve this location after the cue vanished?"
          </p>
          <ContinueButton onClick={onComplete} />
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Beat 3 — Memory Is Not a Static File (was Beat 2)
// ─────────────────────────────────────────────────────────────────────────────

function Beat3Static({ onComplete }: { onComplete: () => void }) {
  const chartRef = useRef<HTMLCanvasElement>(null);
  const odrRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const frameRef = useRef(0);

  const CYCLE = 320;
  const CUE_A = PI / 3;

  // ODR mini canvas
  const OS = 176;
  const OCX = OS / 2, OCY = OS / 2;
  const OR = 62;

  useEffect(() => {
    let running = true;
    const loop = () => {
      if (!running) return;
      frameRef.current++;
      const progress = (frameRef.current % CYCLE) / CYCLE; // 0→1

      // ── ODR mini replay ──────────────────────────────────────────────────
      const oc = odrRef.current;
      if (oc) {
        const ctx = oc.getContext('2d')!;
        fillBg(ctx, OS, OS);
        drawRingCircle(ctx, OCX, OCY, OR, '#1a2f4a');
        drawFixation(ctx, OCX, OCY, '#253d52');

        // phases: fixation 0–0.12, cue 0.12–0.28, delay 0.28–0.78, recall 0.78–1
        if (progress >= 0.12 && progress < 0.28) {
          drawAngleDot(ctx, OCX, OCY, OR, CUE_A, 8, '#3b82f6', true);
        }
        if (progress >= 0.28 && progress < 0.78) {
          // ghost cue fades
          const ghostA = Math.max(0.04, 0.3 - (progress - 0.28) * 0.55);
          const ga = CUE_A - PI / 2;
          const gx = OCX + Math.cos(ga) * OR;
          const gy = OCY + Math.sin(ga) * OR;
          ctx.beginPath();
          ctx.arc(gx, gy, 7, 0, 2 * PI);
          ctx.fillStyle = `rgba(59,130,246,${ghostA})`;
          ctx.fill();
        }
        if (progress >= 0.78) {
          // ghost cue lingers faint
          const ga = CUE_A - PI / 2;
          ctx.beginPath();
          ctx.arc(OCX + Math.cos(ga) * OR, OCY + Math.sin(ga) * OR, 7, 0, 2 * PI);
          ctx.fillStyle = 'rgba(59,130,246,0.12)';
          ctx.fill();
          // recalled dot with slight drift
          const drift = (progress - 0.78) * 0.9;
          drawAngleDot(ctx, OCX, OCY, OR, CUE_A + drift, 8, '#34d399', true);
        }

        // Phase label at bottom
        let phaseLabel = 'Fixation';
        if (progress >= 0.12 && progress < 0.28) phaseLabel = 'Cue';
        else if (progress >= 0.28 && progress < 0.78) phaseLabel = 'Delay';
        else if (progress >= 0.78) phaseLabel = 'Recall';
        ctx.fillStyle = '#334155';
        ctx.font = '9px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(phaseLabel, OCX, OS - 6);
        ctx.textAlign = 'left';
      }

      // ── Main chart ───────────────────────────────────────────────────────
      const cc = chartRef.current;
      if (cc) {
        const ctx = cc.getContext('2d')!;
        const W = cc.width, H = cc.height;
        fillBg(ctx, W, H);

        const pL = 56, pR = 14, pT = 30, pB = 42;
        const pw = W - pL - pR, ph = H - pT - pB;

        const cueOffFrac = 0.28;
        const cueOffX = pL + cueOffFrac * pw;

        // Post-cue shaded region
        ctx.fillStyle = 'rgba(10,22,42,0.55)';
        ctx.fillRect(cueOffX, pT, pw - (cueOffX - pL), ph);

        // Grid lines
        ctx.strokeStyle = '#0a1828';
        ctx.lineWidth = 1;
        for (let i = 0; i <= 4; i++) {
          const y = pT + (i / 4) * ph;
          ctx.beginPath(); ctx.moveTo(pL, y); ctx.lineTo(pL + pw, y); ctx.stroke();
        }

        // Axes
        ctx.strokeStyle = '#1e3a5f';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(pL, pT); ctx.lineTo(pL, pT + ph); ctx.lineTo(pL + pw, pT + ph);
        ctx.stroke();

        // Y-axis label (rotated)
        ctx.save();
        ctx.translate(15, pT + ph / 2);
        ctx.rotate(-PI / 2);
        ctx.fillStyle = '#475569';
        ctx.font = '10px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('memory fidelity', 0, 0);
        ctx.restore();

        // Y ticks
        ctx.fillStyle = '#253d52';
        ctx.font = '9px monospace';
        ctx.textAlign = 'right';
        ctx.fillText('1.0', pL - 5, pT + 4);
        ctx.fillText('0.5', pL - 5, pT + ph / 2 + 4);
        ctx.fillText('0', pL - 5, pT + ph + 4);

        // X label
        ctx.fillStyle = '#475569';
        ctx.font = '10px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('time →', pL + pw / 2, pT + ph + 32);

        // Cue-off line — bright
        ctx.strokeStyle = 'rgba(148,163,184,0.9)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.moveTo(cueOffX, pT); ctx.lineTo(cueOffX, pT + ph);
        ctx.stroke();
        ctx.setLineDash([]);

        // Cue-off label above
        ctx.fillStyle = '#94a3b8';
        ctx.font = '8.5px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('sensory input', cueOffX, pT - 12);
        ctx.fillText('disappears', cueOffX, pT - 3);

        // Animated draw progress
        const xNow = pL + Math.min(progress, 1) * pw;

        // ── Red: passive decay ──
        ctx.beginPath();
        ctx.strokeStyle = '#f87171';
        ctx.lineWidth = 2;
        let rStart = false;
        for (let xp = pL; xp <= xNow; xp += 0.8) {
          const frac = (xp - pL) / pw;
          let val: number;
          if (frac < cueOffFrac) {
            val = 0.86;
          } else {
            val = Math.max(0.03, 0.86 * Math.exp(-(frac - cueOffFrac) * 7.5));
          }
          const yp = pT + ph * (1 - val);
          if (!rStart) { ctx.moveTo(xp, yp); rStart = true; } else ctx.lineTo(xp, yp);
        }
        ctx.stroke();

        // ── Blue: recurrent memory — slow decline + wobble ──
        ctx.beginPath();
        ctx.strokeStyle = '#60a5fa';
        ctx.lineWidth = 2;
        let bStart = false;
        for (let xp = pL; xp <= xNow; xp += 0.8) {
          const frac = (xp - pL) / pw;
          let val: number;
          if (frac < cueOffFrac) {
            val = 0.86;
          } else {
            const el = frac - cueOffFrac;
            const decay = el * 0.19;
            const wobble = 0.03 * Math.sin(el * 24 + 0.4) + 0.018 * Math.sin(el * 41 + 1.7);
            val = Math.max(0.28, 0.86 - decay + wobble);
          }
          const yp = pT + ph * (1 - val);
          if (!bStart) { ctx.moveTo(xp, yp); bStart = true; } else ctx.lineTo(xp, yp);
        }
        ctx.stroke();

        // Direct labels — fade in after 60% progress
        if (progress > 0.6) {
          const alpha = Math.min(1, (progress - 0.6) / 0.15);

          // Red label
          const rFrac = 0.68;
          const rVal = Math.max(0.03, 0.86 * Math.exp(-(rFrac - cueOffFrac) * 7.5));
          const rLabelX = pL + rFrac * pw + 4;
          const rLabelY = pT + ph * (1 - rVal) - 7;
          ctx.fillStyle = `rgba(248,113,113,${alpha})`;
          ctx.font = '9px monospace';
          ctx.textAlign = 'left';
          ctx.fillText('passive trace fades', rLabelX, rLabelY);

          // Blue label (two lines)
          const bFrac = 0.62;
          const bEl = bFrac - cueOffFrac;
          const bVal = Math.max(0.28, 0.86 - bEl * 0.19);
          const bLabelX = pL + bFrac * pw + 4;
          const bLabelY = pT + ph * (1 - bVal) - 20;
          ctx.fillStyle = `rgba(96,165,250,${alpha})`;
          ctx.fillText('recurrent memory', bLabelX, bLabelY);
          ctx.fillText('persists, with noise', bLabelX, bLabelY + 11);
        }
      }

      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => { running = false; cancelAnimationFrame(rafRef.current); };
  }, []);

  // Timeline bar segments
  const timelineSegs = [
    { label: 'fix', flex: 1.2, bg: '#0f2030', border: '#1e3a5f' },
    { label: 'cue', flex: 1.6, bg: '#0f2a4a', border: '#1e5a9f' },
    { label: 'delay', flex: 5, bg: '#0a1e40', border: '#2563eb' },
    { label: 'recall', flex: 2, bg: '#0a1828', border: '#1e3a5f' },
  ];

  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 px-8">
      <BeatLabel text="Beat 3 · Memory is active" />

      <div className="flex gap-10 items-start">
        {/* Left: ODR mini + timeline bar */}
        <div className="flex flex-col items-center gap-1">
          <canvas ref={odrRef} width={OS} height={OS} className="rounded-xl" />
          {/* Timeline bar */}
          <div className="flex" style={{ width: OS }}>
            {timelineSegs.map(({ label, flex, bg, border }) => (
              <div
                key={label}
                style={{ flex, backgroundColor: bg, borderTop: `2px solid ${border}` }}
                className="py-0.5 text-center"
              >
                <span className="text-[8px] font-mono" style={{ color: border }}>{label}</span>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-slate-600">ODR task replay</p>
        </div>

        {/* Right: main chart */}
        <div className="flex flex-col items-center gap-1">
          <canvas ref={chartRef} width={390} height={230} className="rounded-xl" />
        </div>
      </div>

      <div className="text-center space-y-2 max-w-lg">
        <p className="text-lg text-slate-200 leading-relaxed font-light">
          A static trace decays. Active memory persists — imperfectly.
        </p>
        <p className="text-sm text-slate-500 leading-relaxed">
          After the cue disappears, the brain cannot rely on the stimulus anymore. It must sustain
          an internal pattern of activity. That pattern can remain stable enough to guide behavior,
          but it still fluctuates over time.
        </p>
        {/* What to Notice box */}
        <div className="text-left bg-slate-900/60 border border-slate-800 rounded-lg px-4 py-2.5">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">What to notice  </span>
          <span className="text-xs text-slate-400 leading-relaxed">
            After cue-off, passive activity collapses. Recurrent memory stays alive, but it still
            fluctuates. Those fluctuations will later become memory drift and recall error.
          </span>
        </div>
      </div>

      <button
        onClick={onComplete}
        className="px-6 py-2.5 bg-slate-900 hover:bg-slate-800 border border-slate-700 hover:border-slate-600 text-slate-300 rounded-lg text-sm font-medium transition-all"
      >
        Why is location harder than a label? →
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Beat 4 — Continuous vs. Categorical Memory (was Beat 3)
// ─────────────────────────────────────────────────────────────────────────────

function Beat4Continuous({ onComplete }: { onComplete: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dragging, setDragging] = useState(false);
  const [dragAngle, setDragAngle] = useState(PI / 4);
  const [interacted, setInteracted] = useState(false);

  const SIZE = 260;
  const CX = SIZE / 2, CY = SIZE / 2;
  const RING_R = 100;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    fillBg(ctx, SIZE, SIZE);

    // Outer ring with degree labels every 45°
    drawRingCircle(ctx, CX, CY, RING_R, '#1a2f4a', 1.5);
    ctx.font = '9px monospace';
    ctx.fillStyle = '#253d52';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let deg = 0; deg < 360; deg += 45) {
      const a = (deg * PI) / 180 - PI / 2;
      const lx = CX + Math.cos(a) * (RING_R + 17);
      const ly = CY + Math.sin(a) * (RING_R + 17);
      ctx.fillText(`${deg}°`, lx, ly);
    }
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';

    // Gradient fill inside ring
    const innerGrad = ctx.createRadialGradient(CX, CY, 0, CX, CY, RING_R);
    innerGrad.addColorStop(0, 'rgba(59,130,246,0.04)');
    innerGrad.addColorStop(0.8, 'rgba(59,130,246,0.01)');
    innerGrad.addColorStop(1, 'rgba(59,130,246,0)');
    ctx.beginPath();
    ctx.arc(CX, CY, RING_R, 0, 2 * PI);
    ctx.fillStyle = innerGrad;
    ctx.fill();

    // Draggable cue dot
    drawAngleDot(ctx, CX, CY, RING_R, dragAngle, 11, '#60a5fa', true);

    // Spoke from center
    const sa = dragAngle - PI / 2;
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(96,165,250,0.2)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 5]);
    ctx.moveTo(CX, CY);
    ctx.lineTo(CX + Math.cos(sa) * RING_R, CY + Math.sin(sa) * RING_R);
    ctx.stroke();
    ctx.setLineDash([]);

    // Center angle readout
    ctx.fillStyle = '#253d52';
    ctx.font = '11px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(
      interacted ? `${(dragAngle * 180 / PI).toFixed(2)}°` : '← drag',
      CX, CY
    );
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }, [dragAngle, dragging, interacted, CX, CY]);

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    setDragging(true);
    setDragAngle(mouseToAngle(e, CX, CY));
    setInteracted(true);
  };
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (dragging) setDragAngle(mouseToAngle(e, CX, CY));
  };
  const handleMouseUp = () => setDragging(false);

  const CATEGORIES = [
    { label: 'Left', color: '#334155' },
    { label: 'Right', color: '#334155' },
    { label: 'Up', color: '#334155' },
    { label: 'Down', color: '#334155' },
  ];

  return (
    <div className="flex flex-col items-center justify-center h-full gap-8 px-8">
      <BeatLabel text="Beat 4 · Continuous representation" />

      <div className="flex gap-16 items-start">
        {/* Left: discrete categories */}
        <div className="flex flex-col items-center gap-4">
          <p className="text-xs text-slate-600 uppercase tracking-widest">Categorical memory</p>
          <div className="grid grid-cols-2 gap-3">
            {CATEGORIES.map(({ label }) => (
              <div
                key={label}
                className="w-24 h-20 flex items-center justify-center border border-slate-800 rounded-lg bg-slate-900/60 text-slate-500 font-mono text-sm"
              >
                {label}
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-600 text-center max-w-[180px] leading-relaxed">
            A finite set of distinct states. The brain simply selects one.
          </p>
        </div>

        {/* Right: continuous ring */}
        <div className="flex flex-col items-center gap-4">
          <p className="text-xs text-slate-600 uppercase tracking-widest">Continuous memory</p>
          <canvas
            ref={canvasRef}
            width={SIZE}
            height={SIZE}
            className="cursor-grab active:cursor-grabbing rounded-xl"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          />
          <p className="text-xs text-slate-600 text-center max-w-[200px] leading-relaxed">
            {interacted
              ? `${(dragAngle * 180 / PI).toFixed(2)}° — infinitely many nearby positions`
              : 'Drag the dot around the ring.'}
          </p>
        </div>
      </div>

      <div className="text-center space-y-2 max-w-md">
        <p className="text-lg text-slate-200 leading-relaxed font-light">
          The brain must represent a continuum, not choose between discrete states.
        </p>
        <p className="text-sm text-slate-500">
          Any angle from −180° to 180° is equally valid. The number of possible memory states is infinite.
        </p>
      </div>

      <ContinueButton onClick={onComplete} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Beat 5 — Drift and Noise (was Beat 4)
// ─────────────────────────────────────────────────────────────────────────────

function Beat5Drift({ onComplete }: { onComplete: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const netRef = useRef(createNetwork());
  const trailRef = useRef<number[]>([]);
  const frameRef = useRef(0);

  const [delaySteps, setDelaySteps] = useState(80);
  const [noiseLevel, setNoiseLevel] = useState(0.02);
  const delayRef = useRef(delaySteps);
  const noiseRef = useRef(noiseLevel);
  const restartRef = useRef(true);

  delayRef.current = delaySteps;
  noiseRef.current = noiseLevel;

  useEffect(() => { restartRef.current = true; }, [delaySteps, noiseLevel]);

  const SIZE = 300;
  const CX = SIZE / 2, CY = SIZE / 2;
  const RING_R = 110;
  const CUE_ANGLE = PI / 2; // fixed at 90°

  useEffect(() => {
    let running = true;

    const restart = () => {
      let state = createNetwork({ noiseLevel: noiseRef.current });
      state = warmStart(state, CUE_ANGLE);
      state = applyInput(state, state.A, CUE_ANGLE);
      for (let i = 0; i < 30; i++) state = stepNetwork(state, 0.05);
      state = removeInput(state);
      state = { ...state, noiseLevel: noiseRef.current };
      netRef.current = state;
      trailRef.current = [CUE_ANGLE];
      frameRef.current = 0;
      restartRef.current = false;
    };

    restart();

    const loop = () => {
      if (!running) return;

      if (restartRef.current) restart();

      netRef.current = stepNetwork(netRef.current, 0.05);
      frameRef.current++;
      trailRef.current.push(netRef.current.decodedAngle);
      if (trailRef.current.length > delayRef.current) {
        trailRef.current = trailRef.current.slice(-delayRef.current);
      }
      if (frameRef.current >= delayRef.current * 2.5) restartRef.current = true;

      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d')!;
        fillBg(ctx, SIZE, SIZE);
        drawTicks(ctx, CX, CY, RING_R);
        drawRingCircle(ctx, CX, CY, RING_R, '#1a2f4a', 1.5);

        // True cue (faint)
        drawAngleDot(ctx, CX, CY, RING_R, CUE_ANGLE, 8, 'rgba(59,130,246,0.3)');

        // Ghost trail
        const trail = trailRef.current;
        for (let i = 0; i < trail.length - 1; i++) {
          const a = trail[i] - PI / 2;
          const alpha = (i / trail.length) * 0.55;
          const x = CX + Math.cos(a) * RING_R;
          const y = CY + Math.sin(a) * RING_R;
          ctx.beginPath();
          ctx.arc(x, y, 4, 0, 2 * PI);
          ctx.fillStyle = `rgba(99,102,241,${alpha})`;
          ctx.fill();
        }

        // Current position
        drawAngleDot(ctx, CX, CY, RING_R, netRef.current.decodedAngle, 10, '#818cf8', true);

        // Cue label
        const ca = CUE_ANGLE - PI / 2;
        ctx.fillStyle = 'rgba(96,165,250,0.5)';
        ctx.font = '10px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('cue', CX + Math.cos(ca) * (RING_R + 18), CY + Math.sin(ca) * (RING_R + 18));

        // Drift readout
        const err = Math.abs(periodicDist(netRef.current.decodedAngle - CUE_ANGLE) * 180 / PI);
        ctx.fillStyle = err > 8 ? '#f59e0b' : '#4b6070';
        ctx.textAlign = 'center';
        ctx.font = '11px monospace';
        ctx.fillText(`drift: ${err.toFixed(1)}°`, CX, SIZE - 10);
        ctx.textAlign = 'left';
      }

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => { running = false; cancelAnimationFrame(rafRef.current); };
  }, []); // eslint-disable-line

  return (
    <div className="flex flex-col items-center justify-center h-full gap-6 px-8">
      <BeatLabel text="Beat 5 · Drift and noise" />

      <canvas ref={canvasRef} width={SIZE} height={SIZE} className="rounded-xl" />

      <div className="flex gap-8 max-w-sm w-full">
        <div className="flex flex-col gap-1.5 flex-1">
          <div className="flex justify-between text-xs text-slate-600">
            <span>Delay duration</span>
            <span className="font-mono text-slate-500">{delaySteps} steps</span>
          </div>
          <input type="range" min={20} max={200} step={10} value={delaySteps}
            onChange={e => setDelaySteps(parseInt(e.target.value))}
            className="w-full accent-indigo-500" />
        </div>
        <div className="flex flex-col gap-1.5 flex-1">
          <div className="flex justify-between text-xs text-slate-600">
            <span>Noise level</span>
            <span className="font-mono text-slate-500">{noiseLevel.toFixed(3)}</span>
          </div>
          <input type="range" min={0.005} max={0.06} step={0.005} value={noiseLevel}
            onChange={e => setNoiseLevel(parseFloat(e.target.value))}
            className="w-full accent-indigo-500" />
        </div>
      </div>

      <div className="text-center space-y-2 max-w-md">
        <p className="text-lg text-slate-200 leading-relaxed font-light">
          Longer delays and more noise push the memory further from the truth.
        </p>
        <p className="text-sm text-slate-500">
          Continuous representations are vulnerable to diffusion. The brain needs a
          mechanism to resist this drift.
        </p>
      </div>

      <ContinueButton onClick={onComplete} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Beat 6 — Recurrent Neural Dynamics (redesigned — side-by-side + formation)
// ─────────────────────────────────────────────────────────────────────────────

// Draw one ring panel (used for both no-inhib and balanced panels)
function drawRingPanel(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, R: number,
  r: Float64Array, x: number[],
  phase: 'cue' | 'spread' | 'stable' | 'maintain',
  cueAngle: number,
  cueAlpha: number, // 1 during cue, fades to 0
  tInPhase: number
) {
  const N = r.length;
  let maxR = 0;
  for (let i = 0; i < N; i++) if (r[i] > maxR) maxR = r[i];

  // Ring
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, 2 * PI);
  ctx.strokeStyle = '#1a2f4a'; ctx.lineWidth = 1.5; ctx.stroke();

  // Neurons
  const step = Math.max(1, Math.floor(N / 56));
  for (let idx = 0; idx < 56; idx++) {
    const i = (idx * step) % N;
    const angle = x[i] - PI / 2;
    const nx = cx + Math.cos(angle) * R;
    const ny = cy + Math.sin(angle) * R;
    const norm = maxR > 0 ? Math.min(r[i] / maxR, 1) : 0;

    // Recurrent excitation arrow hint on active neurons
    if (norm > 0.5 && (phase === 'spread' || phase === 'stable' || phase === 'maintain')) {
      const pulse = 0.3 + 0.15 * Math.sin(tInPhase * 0.18 + idx * 0.3);
      const grd = ctx.createRadialGradient(nx, ny, 0, nx, ny, 14);
      grd.addColorStop(0, `rgba(96,165,250,${pulse * norm})`);
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.beginPath(); ctx.arc(nx, ny, 14, 0, 2 * PI);
      ctx.fillStyle = grd; ctx.fill();
    }

    const barLen = norm * 36;
    ctx.beginPath();
    ctx.moveTo(nx, ny);
    ctx.lineTo(cx + Math.cos(angle) * (R - barLen), cy + Math.sin(angle) * (R - barLen));
    ctx.strokeStyle = `rgba(96,165,250,${0.1 + norm * 0.8})`;
    ctx.lineWidth = 3;
    ctx.stroke();

    const b = Math.round(30 + norm * 195);
    ctx.beginPath(); ctx.arc(nx, ny, 4, 0, 2 * PI);
    ctx.fillStyle = `rgba(${Math.round(norm*20)},${Math.round(norm*55)},${b},${0.35 + norm * 0.65})`;
    ctx.fill();
  }

  // Cue dot
  if (cueAlpha > 0.01) {
    const ca = cueAngle - PI / 2;
    const cx2 = cx + Math.cos(ca) * (R + 18);
    const cy2 = cy + Math.sin(ca) * (R + 18);
    const grd = ctx.createRadialGradient(cx2, cy2, 0, cx2, cy2, 10);
    grd.addColorStop(0, `rgba(59,130,246,${cueAlpha})`);
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.beginPath(); ctx.arc(cx2, cy2, 10, 0, 2 * PI);
    ctx.fillStyle = grd; ctx.fill();
    ctx.beginPath(); ctx.arc(cx2, cy2, 5, 0, 2 * PI);
    ctx.fillStyle = `rgba(96,165,250,${cueAlpha})`; ctx.fill();
  }
}

function Beat6Neural({ onComplete }: { onComplete: () => void }) {
  const leftRef = useRef<HTMLCanvasElement>(null);   // no inhibition
  const rightRef = useRef<HTMLCanvasElement>(null);  // balanced inhibition
  const rafRef = useRef<number>(0);
  const frameRef = useRef(0);
  const noInhibRef = useRef(createNetwork({ k: 0.0, noiseLevel: 0.002 }));
  const inhibRef = useRef(createNetwork({ k: 0.5, noiseLevel: 0.002 }));
  const phaseRef = useRef<'cue' | 'spread' | 'stable' | 'maintain'>('cue');
  const [phaseLabel, setPhaseLabel] = useState('cue');
  const [inhibK, setInhibK] = useState(0.5);
  const inhibKRef = useRef(inhibK);
  inhibKRef.current = inhibK;

  const SIZE = 250;
  const CX = SIZE / 2, CY = SIZE / 2;
  const R = 96;
  const CUE = PI / 2;

  const initBoth = () => {
    let ni = createNetwork({ k: 0.0, noiseLevel: 0.002 });
    ni = warmStart(ni, CUE);
    ni = applyInput(ni, ni.A, CUE);
    noInhibRef.current = ni;

    let wi = createNetwork({ k: inhibKRef.current, noiseLevel: 0.002 });
    wi = warmStart(wi, CUE);
    wi = applyInput(wi, wi.A, CUE);
    inhibRef.current = wi;

    frameRef.current = 0;
    phaseRef.current = 'cue';
    setPhaseLabel('cue');
  };

  useEffect(initBoth, []); // eslint-disable-line

  // Re-init right side when k changes
  useEffect(() => {
    let wi = createNetwork({ k: inhibK, noiseLevel: 0.002 });
    wi = warmStart(wi, CUE);
    wi = applyInput(wi, wi.A, CUE);
    inhibRef.current = wi;
    frameRef.current = 0;
    phaseRef.current = 'cue';
    setPhaseLabel('cue');
  }, [inhibK]); // eslint-disable-line

  useEffect(() => {
    let running = true;

    const loop = () => {
      if (!running) return;
      frameRef.current++;
      const f = frameRef.current;

      // Phase transitions
      if (f === 60) { phaseRef.current = 'spread'; setPhaseLabel('spread'); }
      if (f === 120) { phaseRef.current = 'stable'; setPhaseLabel('stable'); }
      if (f === 180) {
        noInhibRef.current = removeInput(noInhibRef.current);
        inhibRef.current = removeInput(inhibRef.current);
        phaseRef.current = 'maintain'; setPhaseLabel('maintain');
      }
      if (f > 380) { initBoth(); return; }

      noInhibRef.current = stepNetwork(noInhibRef.current, 0.05);
      inhibRef.current = stepNetwork(inhibRef.current, 0.05);

      const cueAlpha = f < 180 ? 1 : Math.max(0, 1 - (f - 180) / 40);
      const phase = phaseRef.current;
      const tInPhase = f;

      [
        [leftRef, noInhibRef.current] as const,
        [rightRef, inhibRef.current] as const,
      ].forEach(([ref, net]) => {
        const canvas = ref.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d')!;
        fillBg(ctx, SIZE, SIZE);
        drawRingPanel(ctx, CX, CY, R, net.r, net.x, phase, CUE, cueAlpha, tInPhase);
      });

      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => { running = false; cancelAnimationFrame(rafRef.current); };
  }, [inhibK]); // eslint-disable-line

  // Timeline labels
  const timelinePhases = [
    { label: 'cue on', active: phaseLabel === 'cue', color: '#60a5fa' },
    { label: 'spread', active: phaseLabel === 'spread', color: '#a78bfa' },
    { label: 'stabilize', active: phaseLabel === 'stable', color: '#34d399' },
    { label: 'cue off', active: phaseLabel === 'maintain', color: '#f59e0b' },
    { label: 'sustained', active: false, color: '#334155' },
  ];

  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 px-6">
      <BeatLabel text="Beat 6 · Recurrent neural dynamics" />

      {/* Headline */}
      <div className="text-center">
        <p className="text-xl text-slate-100 font-light">Local recurrence keeps the memory alive.</p>
        <p className="text-sm text-slate-500 mt-1">Inhibition prevents the activity from spreading everywhere.</p>
      </div>

      {/* Side-by-side canvases */}
      <div className="flex gap-6 items-start">
        <div className="flex flex-col items-center gap-1.5">
          <p className="text-xs font-mono text-red-400 uppercase tracking-widest">No inhibition (k=0)</p>
          <canvas ref={leftRef} width={SIZE} height={SIZE} className="rounded-xl border border-slate-800" />
          <p className="text-[10px] text-slate-500 text-center">Activity spreads — location lost</p>
        </div>
        <div className="flex flex-col items-center gap-1.5">
          <p className="text-xs font-mono text-emerald-400 uppercase tracking-widest">
            Balanced inhibition (k={inhibK.toFixed(1)})
          </p>
          <canvas ref={rightRef} width={SIZE} height={SIZE} className="rounded-xl border border-slate-800" />
          <p className="text-[10px] text-slate-500 text-center">Localized bump persists</p>
        </div>

        {/* Right panel */}
        <div className="flex flex-col gap-3 max-w-[180px]">
          {/* Timeline */}
          <div className="flex flex-col gap-1">
            {timelinePhases.map(tp => (
              <div key={tp.label} className="flex items-center gap-2">
                <div
                  className="w-2 h-2 rounded-full transition-all"
                  style={{ backgroundColor: tp.active ? tp.color : '#1e3a5f' }}
                />
                <span className="text-[10px] font-mono" style={{ color: tp.active ? tp.color : '#334155' }}>
                  {tp.label}
                </span>
              </div>
            ))}
          </div>

          {/* Inhibition slider */}
          <div className="space-y-1">
            <div className="flex justify-between text-[10px] text-slate-500">
              <span>Inhibition k</span>
              <span className="font-mono text-emerald-400">{inhibK.toFixed(2)}</span>
            </div>
            <input
              type="range" min={0.0} max={1.0} step={0.05} value={inhibK}
              onChange={e => setInhibK(parseFloat(e.target.value))}
              className="w-full accent-emerald-500"
            />
            <p className="text-[9px] text-slate-600 leading-tight">
              Drag left → bump spreads. Drag right → bump localizes.
            </p>
          </div>

          {/* What to notice */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-lg p-2.5 text-[10px] text-slate-400 leading-relaxed space-y-1">
            <p className="text-slate-500 font-semibold uppercase tracking-wide text-[9px]">What to notice</p>
            <p>Nearby neurons reinforce each other.</p>
            <p>Without inhibition, activity spreads uncontrollably.</p>
            <p>The bump survives after cue-off.</p>
          </div>
        </div>
      </div>

      <ContinueButton onClick={onComplete} label="Why can this bump move freely? →" />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Beat 7 — Translation Invariance (new final beat → CTA enters app)
// ─────────────────────────────────────────────────────────────────────────────

function Beat7Translation({ onEnter }: { onEnter: () => void }) {
  const leftRef = useRef<HTMLCanvasElement>(null);   // non-TI: bump drifts to 0
  const rightRef = useRef<HTMLCanvasElement>(null);  // TI: bump stays at cue
  const connRef = useRef<HTMLCanvasElement>(null);   // connection profile
  const rafRef = useRef<number>(0);
  const frameRef = useRef(0);
  const [screen, setScreen] = useState<1 | 2>(1);
  const screenRef = useRef<1 | 2>(1);
  screenRef.current = screen;

  // Screen 1: TI vs non-TI networks
  const CUE = PI / 3;
  const noTIRef = useRef(createNetwork({ k: 0.5, noiseLevel: 0.001 }));
  const tiRef = useRef(createNetwork({ k: 0.5, noiseLevel: 0.001 }));

  // Screen 2: Connection slider
  const [connNeuron, setConnNeuron] = useState(0); // index of highlighted neuron
  const connNeuronRef = useRef(connNeuron);
  connNeuronRef.current = connNeuron;

  const SIZE = 230;
  const CX = SIZE / 2, CY = SIZE / 2, R = 88;
  const N_CONN = 48;

  const initNetworks = () => {
    // TI net: normal, bump stays at cue
    let ti = createNetwork({ k: 0.5, noiseLevel: 0.002 });
    ti = warmStart(ti, CUE);
    ti = applyInput(ti, ti.A, CUE);
    for (let i = 0; i < 40; i++) ti = stepNetwork(ti, 0.05);
    ti = removeInput(ti);
    tiRef.current = ti;

    // Non-TI: simulate by adding a constant bias toward angle 0 — bump drifts
    let nti = createNetwork({ k: 0.5, noiseLevel: 0.001 });
    nti = warmStart(nti, CUE);
    nti = applyInput(nti, nti.A, CUE);
    for (let i = 0; i < 40; i++) nti = stepNetwork(nti, 0.05);
    nti = removeInput(nti);
    noTIRef.current = nti;
    frameRef.current = 0;
  };

  useEffect(() => { initNetworks(); }, []); // eslint-disable-line

  const drawRingSmall = (
    ctx: CanvasRenderingContext2D,
    net: { r: Float64Array; x: number[]; decodedAngle: number },
    label: string, labelColor: string,
    showCueGhost: boolean
  ) => {
    fillBg(ctx, SIZE, SIZE);
    ctx.beginPath();
    ctx.arc(CX, CY, R, 0, 2 * PI);
    ctx.strokeStyle = '#1a2f4a'; ctx.lineWidth = 1.5; ctx.stroke();

    const { r, x } = net;
    let maxR = 0; for (let i = 0; i < r.length; i++) if (r[i] > maxR) maxR = r[i];
    const step = Math.max(1, Math.floor(r.length / 40));
    for (let idx = 0; idx < 40; idx++) {
      const i = (idx * step) % r.length;
      const angle = x[i] - PI / 2;
      const nx = CX + Math.cos(angle) * R;
      const ny = CY + Math.sin(angle) * R;
      const norm = maxR > 0 ? Math.min(r[i] / maxR, 1) : 0;
      const barLen = norm * 32;
      ctx.beginPath(); ctx.moveTo(nx, ny);
      ctx.lineTo(CX + Math.cos(angle) * (R - barLen), CY + Math.sin(angle) * (R - barLen));
      ctx.strokeStyle = `rgba(96,165,250,${0.08 + norm * 0.82})`; ctx.lineWidth = 2.8; ctx.stroke();
      const b = Math.round(30 + norm * 200);
      ctx.beginPath(); ctx.arc(nx, ny, 3.5, 0, 2 * PI);
      ctx.fillStyle = `rgba(${Math.round(norm*18)},${Math.round(norm*50)},${b},${0.3 + norm*0.7})`; ctx.fill();
    }

    // Ghost cue
    if (showCueGhost) {
      const ca = CUE - PI / 2;
      ctx.beginPath(); ctx.arc(CX + Math.cos(ca) * R, CY + Math.sin(ca) * R, 5, 0, 2 * PI);
      ctx.fillStyle = 'rgba(59,130,246,0.3)'; ctx.fill();
    }

    ctx.fillStyle = labelColor; ctx.font = '10px monospace'; ctx.textAlign = 'center';
    ctx.fillText(label, CX, SIZE - 10); ctx.textAlign = 'left';
  };

  const drawConnections = (ctx: CanvasRenderingContext2D, highlightedIdx: number) => {
    fillBg(ctx, SIZE, SIZE);
    ctx.beginPath(); ctx.arc(CX, CY, R, 0, 2 * PI);
    ctx.strokeStyle = '#1a2f4a'; ctx.lineWidth = 1.5; ctx.stroke();

    const hiAngle = (highlightedIdx / N_CONN) * 2 * PI;
    const a = 0.35; // connection width

    for (let i = 0; i < N_CONN; i++) {
      const angle = (i / N_CONN) * 2 * PI - PI / 2;
      const nx = CX + Math.cos(angle) * R;
      const ny = CY + Math.sin(angle) * R;

      // Gaussian connection strength
      let d = (i / N_CONN) * 2 * PI - hiAngle;
      while (d > PI) d -= 2 * PI;
      while (d < -PI) d += 2 * PI;
      const strength = Math.exp(-(d * d) / (2 * a * a));

      // Connection line from highlighted neuron
      if (strength > 0.05) {
        const hiA = hiAngle - PI / 2;
        const hx = CX + Math.cos(hiA) * R;
        const hy = CY + Math.sin(hiA) * R;
        ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(nx, ny);
        ctx.strokeStyle = `rgba(251,191,36,${strength * 0.4})`;
        ctx.lineWidth = strength * 2.5; ctx.stroke();
      }

      // Neuron dot
      const isHi = i === highlightedIdx;
      ctx.beginPath(); ctx.arc(nx, ny, isHi ? 7 : 3.5 + strength * 3, 0, 2 * PI);
      ctx.fillStyle = isHi ? '#fbbf24' : `rgba(${Math.round(strength*30)},${Math.round(strength*80)},${Math.round(30+strength*190)},${0.3 + strength*0.7})`;
      ctx.fill();
    }

    // Label
    ctx.fillStyle = '#fbbf24'; ctx.font = '10px monospace'; ctx.textAlign = 'center';
    ctx.fillText('Gaussian connection profile', CX, SIZE - 10);
    ctx.fillText('moves with the neuron', CX, SIZE - 0);
    ctx.textAlign = 'left';
  };

  useEffect(() => {
    let running = true;
    const loop = () => {
      if (!running) return;
      frameRef.current++;
      const f = frameRef.current;

      if (screenRef.current === 1) {
        tiRef.current = stepNetwork(tiRef.current, 0.05);
        // Non-TI: add tiny bias toward 0 to simulate drift
        const nti = stepNetwork(noTIRef.current, 0.05);
        // Inject small bias toward angle 0 (privileged location)
        const N = nti.u.length;
        const biasedU = new Float64Array(N);
        for (let i = 0; i < N; i++) {
          const angle = nti.x[i];
          const bias = 0.03 * Math.exp(-angle * angle / 0.4);
          biasedU[i] = nti.u[i] + bias;
        }
        noTIRef.current = { ...nti, u: biasedU };

        if (f > 400) { initNetworks(); return; }

        const lc = leftRef.current;
        if (lc) drawRingSmall(lc.getContext('2d')!, noTIRef.current, 'drifts toward 0°', '#f87171', true);
        const rc = rightRef.current;
        if (rc) drawRingSmall(rc.getContext('2d')!, tiRef.current, 'stays at cue', '#34d399', true);
      } else {
        const cc = connRef.current;
        if (cc) drawConnections(cc.getContext('2d')!, connNeuronRef.current);
      }

      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => { running = false; cancelAnimationFrame(rafRef.current); };
  }, [screen]); // eslint-disable-line

  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 px-8">
      <BeatLabel text="Beat 7 · Translation invariance" />

      {screen === 1 ? (
        <>
          <div className="text-center">
            <p className="text-xl text-slate-100 font-light">What if the network preferred one location?</p>
            <p className="text-sm text-slate-500 mt-1">
              A non-symmetric network has one energetically preferred state. A translation-invariant one treats every angle equally.
            </p>
          </div>

          <div className="flex gap-8 items-start">
            <div className="flex flex-col items-center gap-1.5">
              <p className="text-xs font-mono text-red-400 uppercase tracking-widest">Non-invariant</p>
              <canvas ref={leftRef} width={SIZE} height={SIZE} className="rounded-xl border border-slate-800" />
              <p className="text-[10px] text-slate-500">Like a bowl — rolls to one point</p>
            </div>
            <div className="flex flex-col items-center gap-1.5">
              <p className="text-xs font-mono text-emerald-400 uppercase tracking-widest">Translation-invariant</p>
              <canvas ref={rightRef} width={SIZE} height={SIZE} className="rounded-xl border border-slate-800" />
              <p className="text-[10px] text-slate-500">Like a flat floor — stable anywhere</p>
            </div>
          </div>

          <button
            onClick={() => { setScreen(2); }}
            className="px-5 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 rounded-lg text-sm font-medium transition-all"
          >
            How does the connection rule create this? →
          </button>
        </>
      ) : (
        <>
          <div className="text-center">
            <p className="text-xl text-slate-100 font-light">Each neuron connects to nearby angles — always.</p>
            <p className="text-sm text-slate-500 mt-1">
              Drag the slider to move the highlighted neuron. Its Gaussian connection profile moves with it.
              <br />Connection strength depends only on the <em>difference</em> between preferred angles, not on absolute angle.
            </p>
          </div>

          <canvas ref={connRef} width={SIZE} height={SIZE} className="rounded-xl border border-slate-800" />

          <div className="flex flex-col gap-1 w-64">
            <div className="flex justify-between text-xs text-slate-500">
              <span>Neuron position</span>
              <span className="font-mono text-amber-400">{(connNeuron / N_CONN * 360).toFixed(0)}°</span>
            </div>
            <input
              type="range" min={0} max={N_CONN - 1} step={1} value={connNeuron}
              onChange={e => setConnNeuron(parseInt(e.target.value))}
              className="w-full accent-amber-500"
            />
            <p className="text-[10px] text-slate-600 text-center">
              The profile always looks the same — just centered at the neuron's preferred angle.
            </p>
          </div>

          <div className="bg-slate-900/60 border border-slate-800 rounded-lg px-4 py-2.5 max-w-sm text-center">
            <p className="text-xs text-slate-300 leading-relaxed">
              This symmetry means every bump position is equally stable.
              The network supports <em>infinitely many</em> stable memory states — this is why it is called a <strong className="text-white">continuous attractor</strong>.
            </p>
          </div>

          <button
            onClick={onEnter}
            className="mt-1 px-8 py-3 bg-blue-700 hover:bg-blue-600 active:bg-blue-800 text-white font-semibold rounded-lg text-sm transition-colors shadow-xl shadow-blue-950/60 tracking-wide"
          >
            Explore the attractor manifold →
          </button>
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main export
// ─────────────────────────────────────────────────────────────────────────────

export function LandingPage({ onEnter }: { onEnter: () => void }) {
  const [beat, setBeat] = useState(0);
  const advance = () => setBeat(b => Math.min(b + 1, 7));

  // Hero screen: full-screen, no top bar
  if (beat === 0) {
    return (
      <div className="h-screen flex flex-col bg-[#050d18] text-slate-100 overflow-hidden">
        <Beat0Hero key="b0" onBegin={advance} />
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-[#050d18] text-slate-100 overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center justify-between px-8 py-3 border-b border-white/5 shrink-0">
        <button
          onClick={() => setBeat(0)}
          className="text-xs font-mono text-slate-700 hover:text-slate-500 uppercase tracking-widest transition-colors"
        >
          ← CANN
        </button>
        <ProgressDots beat={beat} total={7} onJump={setBeat} />
      </div>

      {/* Beat content — keyed so each beat mounts fresh */}
      <div className="flex-1 overflow-hidden">
        {beat === 1 && <Beat1Science key="b1" onComplete={advance} />}
        {beat === 2 && <Beat2ODR key="b2" onComplete={advance} />}
        {beat === 3 && <Beat3Static key="b3" onComplete={advance} />}
        {beat === 4 && <Beat4Continuous key="b4" onComplete={advance} />}
        {beat === 5 && <Beat5Drift key="b5" onComplete={advance} />}
        {beat === 6 && <Beat6Neural key="b6" onComplete={advance} />}
        {beat === 7 && <Beat7Translation key="b7" onEnter={onEnter} />}
      </div>
    </div>
  );
}
