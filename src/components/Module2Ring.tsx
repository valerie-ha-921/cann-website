/**
 * Module 2: Ring Network + Bump Formation — Reveal the Mechanism
 *
 * The cue from Module 1 activates neurons on a ring. Local recurrent excitation
 * and global inhibition create a persistent bump after the cue disappears.
 * Live CANN dynamics run every animation frame.
 *
 * Stability classifier (v2):
 *   Uses circular concentration R̄, peak count, drift velocity, and amplitude
 *   to distinguish: stable bump | weak/dying | fragmented | drifting | diffuse/runaway | unstable
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { NarrativeStrip } from './NarrativeStrip';
import { MetricBadge } from './MetricBadge';
import { SliderControl } from './SliderControl';
import { UnderTheHood } from './UnderTheHood';
import { useNetworkStore } from '../store/networkStore';

const DT = 0.05;

// ─────────────────────────────────────────────────────────────────────────────
// Stability classifier helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Circular concentration R̄ ∈ [0,1]. 1 = perfectly localised, 0 = uniform. */
function circularConcentration(r: Float64Array, x: number[]): number {
  let sumR = 0, sumCos = 0, sumSin = 0;
  for (let i = 0; i < r.length; i++) {
    const ri = Math.max(0, r[i]);
    sumR += ri;
    sumCos += ri * Math.cos(x[i]);
    sumSin += ri * Math.sin(x[i]);
  }
  if (sumR < 1e-6) return 0;
  return Math.sqrt(sumCos * sumCos + sumSin * sumSin) / sumR;
}

/** Count local maxima in r[] that exceed 30 % of the global max. */
function countPeaks(r: Float64Array): number {
  const N = r.length;
  let maxR = 0;
  for (let i = 0; i < N; i++) if (r[i] > maxR) maxR = r[i];
  if (maxR < 1e-6) return 0;
  const thresh = 0.3 * maxR;
  let peaks = 0;
  for (let i = 0; i < N; i++) {
    const prev = r[(i - 1 + N) % N];
    const next = r[(i + 1) % N];
    if (r[i] > thresh && r[i] >= prev && r[i] >= next) peaks++;
  }
  return peaks;
}

type BumpStatus =
  | 'stable bump'
  | 'weak / dying'
  | 'fragmented'
  | 'drifting'
  | 'diffuse / runaway'
  | 'unstable';

interface StatusResult {
  status: BumpStatus;
  reason: string;
  color: string;        // Tailwind text colour
  barColor: string;     // Tailwind bg colour for gauge fill
}

function classifyBump(
  r: Float64Array,
  x: number[],
  amplitude: number,
  driftVelRad: number   // rad/s — absolute value
): StatusResult {
  const conc = circularConcentration(r, x);
  const peaks = countPeaks(r);

  // Runaway / diffuse: very high amplitude but spread (low concentration)
  if (amplitude > 6 && conc < 0.5) {
    return {
      status: 'diffuse / runaway',
      reason: 'Activity is very high but spread across the ring — inhibition too weak.',
      color: 'text-red-400',
      barColor: 'bg-red-500',
    };
  }

  // Dead / dying: essentially no activity
  if (amplitude < 0.05) {
    return {
      status: 'weak / dying',
      reason: 'Bump amplitude is near zero — inhibition is too strong.',
      color: 'text-orange-400',
      barColor: 'bg-orange-500',
    };
  }

  // Fragmented: multiple peaks (shouldn't happen in normal CANN, but can with bad params)
  if (peaks >= 3) {
    return {
      status: 'fragmented',
      reason: `${peaks} separate activity peaks detected — parameters outside the attractor regime.`,
      color: 'text-yellow-400',
      barColor: 'bg-yellow-500',
    };
  }

  // Drifting: decent bump but moving fast
  if (conc > 0.45 && driftVelRad > 0.08) {
    return {
      status: 'drifting',
      reason: `Bump is moving at ${(driftVelRad * 180 / Math.PI).toFixed(1)}°/s — noise is displacing it.`,
      color: 'text-amber-400',
      barColor: 'bg-amber-500',
    };
  }

  // Unstable / incoherent: low concentration with moderate amplitude
  if (conc < 0.45) {
    return {
      status: 'unstable',
      reason: 'Activity is incoherent — the network cannot maintain a localised bump.',
      color: 'text-red-400',
      barColor: 'bg-red-500',
    };
  }

  // Stable
  return {
    status: 'stable bump',
    reason: 'A single localised peak is sustained. Excitation and inhibition are balanced.',
    color: 'text-emerald-400',
    barColor: 'bg-emerald-500',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Canvas drawing
// ─────────────────────────────────────────────────────────────────────────────

function drawRingNetwork(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  r: Float64Array,
  x: number[],
  decodedAngle: number,
  cueAngle: number
) {
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#0d1b2a';
  ctx.fillRect(0, 0, w, h);

  const cx = w / 2, cy = h / 2;
  const ringR = Math.min(w, h) * 0.36;
  const N = r.length;

  let maxR = 0;
  for (let i = 0; i < N; i++) if (r[i] > maxR) maxR = r[i];

  const dotR = 5;
  for (let i = 0; i < N; i++) {
    const angle = x[i] - Math.PI / 2;
    const nx = cx + Math.cos(angle) * ringR;
    const ny = cy + Math.sin(angle) * ringR;
    const norm = maxR > 0 ? r[i] / maxR : 0;

    const blue = Math.round(norm * 200 + 55);
    const green = Math.round(norm * 80);
    const red = Math.round(norm * 30);
    ctx.beginPath();
    ctx.arc(nx, ny, dotR, 0, 2 * Math.PI);
    ctx.fillStyle = `rgb(${red},${green},${blue})`;
    ctx.fill();
  }

  // Bump profile as polar histogram
  for (let i = 0; i < N; i++) {
    const angle = x[i] - Math.PI / 2;
    const norm = maxR > 0 ? r[i] / maxR : 0;
    const innerR = ringR * 0.55;
    const outerR = innerR + norm * ringR * 0.3;
    const alpha = 0.4 + norm * 0.5;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(angle) * innerR, cy + Math.sin(angle) * innerR);
    ctx.lineTo(cx + Math.cos(angle) * outerR, cy + Math.sin(angle) * outerR);
    ctx.strokeStyle = `rgba(96,165,250,${alpha})`;
    ctx.lineWidth = (2 * Math.PI * innerR) / N * 0.85;
    ctx.stroke();
  }

  // Decoded angle indicator (green spoke)
  const decCanvas = decodedAngle - Math.PI / 2;
  ctx.beginPath();
  ctx.strokeStyle = '#34d399';
  ctx.lineWidth = 2;
  ctx.setLineDash([5, 3]);
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + Math.cos(decCanvas) * (ringR + 20), cy + Math.sin(decCanvas) * (ringR + 20));
  ctx.stroke();
  ctx.setLineDash([]);

  // Cue angle indicator (blue dot)
  const cueCanvas = cueAngle - Math.PI / 2;
  const cueX = cx + Math.cos(cueCanvas) * (ringR + 22);
  const cueY = cy + Math.sin(cueCanvas) * (ringR + 22);
  ctx.beginPath();
  ctx.arc(cueX, cueY, 5, 0, 2 * Math.PI);
  ctx.fillStyle = '#60a5fa';
  ctx.fill();

  ctx.fillStyle = '#94a3b8';
  ctx.font = '11px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('●  Decoded angle  ●  Cue position', cx, h - 14);
  ctx.textAlign = 'left';
}

function drawFireRateChart(canvas: HTMLCanvasElement, r: Float64Array, _x: number[]) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#0a1628';
  ctx.fillRect(0, 0, w, h);

  const N = r.length;
  let maxR = 0;
  for (let i = 0; i < N; i++) if (r[i] > maxR) maxR = r[i];

  const barW = w / N;
  for (let i = 0; i < N; i++) {
    const norm = maxR > 0 ? r[i] / maxR : 0;
    const barH = norm * (h - 8);
    const blue = Math.round(norm * 200 + 55);
    ctx.fillStyle = `rgba(${Math.round(norm * 30)},${Math.round(norm * 80)},${blue},0.9)`;
    ctx.fillRect(i * barW, h - barH, barW - 0.5, barH);
  }

  ctx.fillStyle = '#475569';
  ctx.font = '9px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('-π', 0, h - 2);
  ctx.fillText('0', w / 2, h - 2);
  ctx.fillText('π', w - 2, h - 2);
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

const DRIFT_HISTORY = 20; // frames to average drift over

export function Module2Ring({ onContinue }: { onContinue: () => void }) {
  const ringRef = useRef<HTMLCanvasElement>(null);
  const barRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);

  // Drift velocity tracking
  const angleHistRef = useRef<number[]>([]);
  const driftVelRef = useRef<number>(0);

  const {
    net, cueAngle, setParam, setNoiseLevel, tick, initNetwork, doWarmStart, presentCue, startDelay
  } = useNetworkStore();

  const [localK, setLocalK] = useState(net.k);
  const [localA, setLocalA] = useState(net.a);
  const [localNoise, setLocalNoise] = useState(net.noiseLevel);
  const [stimActive, setStimActive] = useState(true);
  const [initialized, setInitialized] = useState(false);

  // Live status state (updated every few frames to avoid excessive re-renders)
  const [statusResult, setStatusResult] = useState<StatusResult>({
    status: 'stable bump',
    reason: 'Initialising…',
    color: 'text-emerald-400',
    barColor: 'bg-emerald-500',
  });
  const [concentration, setConcentration] = useState(0);
  const frameCountRef = useRef(0);

  // Initialization
  useEffect(() => {
    if (!initialized) {
      initNetwork({ k: localK, a: localA, noiseLevel: localNoise });
      doWarmStart();
      presentCue();
      setInitialized(true);
    }
  }, [initialized, initNetwork, doWarmStart, presentCue, localK, localA, localNoise]);

  const drawBoth = useCallback(() => {
    const { net: n } = useNetworkStore.getState();

    // --- Drift velocity ---
    const hist = angleHistRef.current;
    hist.push(n.decodedAngle);
    if (hist.length > DRIFT_HISTORY) hist.shift();

    if (hist.length >= 2) {
      // Circular difference between oldest and newest, normalised per frame
      let diff = hist[hist.length - 1] - hist[0];
      // Wrap to [-π, π]
      while (diff > Math.PI) diff -= 2 * Math.PI;
      while (diff < -Math.PI) diff += 2 * Math.PI;
      driftVelRef.current = Math.abs(diff) / (hist.length * DT);
    }

    // --- Canvas draws ---
    if (ringRef.current) {
      const ctx = ringRef.current.getContext('2d');
      if (ctx) drawRingNetwork(ctx, ringRef.current.width, ringRef.current.height,
        n.r, n.x, n.decodedAngle, cueAngle);
    }
    if (barRef.current) {
      drawFireRateChart(barRef.current, n.r, n.x);
    }

    // --- Update status every 12 frames (≈5 Hz) to keep UI readable ---
    frameCountRef.current++;
    if (frameCountRef.current % 12 === 0) {
      const conc = circularConcentration(n.r, n.x);
      const result = classifyBump(n.r, n.x, n.bumpAmplitude, driftVelRef.current);
      setConcentration(conc);
      setStatusResult(result);
    }
  }, [cueAngle]);

  // Animation loop
  useEffect(() => {
    let running = true;
    const loop = () => {
      if (!running) return;
      tick(DT);
      drawBoth();
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => { running = false; cancelAnimationFrame(rafRef.current); };
  }, [tick, drawBoth]);

  const applyParams = () => {
    setParam('k', localK);
    setParam('a', localA);
    setNoiseLevel(localNoise);
    initNetwork({ k: localK, a: localA, noiseLevel: localNoise });
    doWarmStart();
    angleHistRef.current = [];
    driftVelRef.current = 0;
    if (stimActive) presentCue(); else startDelay();
  };

  const toggleStim = () => {
    if (stimActive) { startDelay(); setStimActive(false); }
    else { presentCue(); setStimActive(true); }
  };

  const { bumpCenter, bumpAmplitude, bumpWidth, decodedAngle } = net;

  // Concentration gauge percentage (clamped 0-100)
  const concPct = Math.round(Math.min(concentration * 100, 100));

  return (
    <div className="flex flex-col h-full">
      <NarrativeStrip
        moduleNum={2}
        question="How does the network hold the memory?"
        subtitle="Recurrent excitation and global inhibition create a self-sustaining activity bump — the neural substrate of working memory."
      />

      <div className="flex flex-1 overflow-hidden">
        {/* Main: ring + bar chart */}
        <div className="flex-1 flex flex-col items-center justify-center bg-slate-950 p-4 gap-3">
          <canvas
            ref={ringRef}
            width={400}
            height={400}
            className="rounded-xl border border-slate-800 shadow-2xl"
          />
          <div className="w-full max-w-[400px]">
            <p className="text-xs text-slate-500 mb-1 font-mono">Firing rate r(x) vs preferred angle x</p>
            <canvas
              ref={barRef}
              width={400}
              height={80}
              className="rounded border border-slate-800 w-full"
            />
          </div>
        </div>

        {/* Right panel */}
        <div className="w-80 flex flex-col border-l border-white/10 bg-slate-900/50 overflow-y-auto">
          <div className="p-5 space-y-4 flex-1">
            <div>
              <h3 className="text-sm font-semibold text-white mb-1">What to notice</h3>
              <p className="text-sm text-slate-400 leading-relaxed">
                The bump forms near the cue angle (blue dot) and persists after the cue
                disappears. Try increasing noise — watch the bump drift. Too much inhibition
                (k) and the bump dies. Too little and it grows without bound.
              </p>
            </div>

            {/* Metric badges */}
            <div className="grid grid-cols-2 gap-2">
              <MetricBadge label="Bump center" value={`${(bumpCenter * 180 / Math.PI).toFixed(1)}°`} color="blue" />
              <MetricBadge label="Decoded" value={`${(decodedAngle * 180 / Math.PI).toFixed(1)}°`} color="green" />
              <MetricBadge label="Amplitude" value={bumpAmplitude} color="purple" />
              <MetricBadge label="Width" value={`${bumpWidth.toFixed(2)} rad`} color="blue" />
            </div>

            {/* ── Enhanced status panel ── */}
            <div className="rounded-lg border border-slate-700/60 bg-slate-950/60 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase tracking-widest text-slate-500 font-mono">Network status</span>
                <span className={`text-xs font-bold font-mono ${statusResult.color}`}>
                  {statusResult.status}
                </span>
              </div>

              {/* Concentration gauge */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] text-slate-500 font-mono">Concentration R̄</span>
                  <span className="text-[10px] text-slate-400 font-mono">{concPct}%</span>
                </div>
                <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${statusResult.barColor}`}
                    style={{ width: `${concPct}%` }}
                  />
                </div>
                <p className="text-[9px] text-slate-600 mt-0.5 font-mono">
                  R̄ = √(C²+S²)/Σr  ·  1 = perfectly localised
                </p>
              </div>

              {/* Reason text */}
              <p className="text-[11px] text-slate-400 leading-snug border-t border-slate-800 pt-2">
                {statusResult.reason}
              </p>
            </div>

            <UnderTheHood
              equation={`r_i = max(u_i,0)² / (1 + k/8 · Σ_j max(u_j,0)² · dx / (√2π·a))`}
              explanation="Divisive normalization: each neuron's output is divided by global activity. This prevents runaway excitation and creates the 'k' parameter's stabilizing effect."
              code={`function computeRates(u, k, dx, a) {
  let sumR = 0;
  const r = u.map(ui => { const v=Math.max(ui,0)**2; sumR+=v; return v; });
  const B = 1 + 0.125*k*sumR*dx/(Math.sqrt(2*Math.PI)*a);
  return r.map(ri => ri / B);
}`}
            />
          </div>

          <div className="p-5 border-t border-white/10 space-y-4">
            <h3 className="text-xs uppercase tracking-widest text-slate-500">Parameters</h3>

            <SliderControl
              label="Global inhibition k"
              value={localK}
              min={0.2}
              max={1.2}
              step={0.05}
              onChange={setLocalK}
              description="Too low → runaway. Too high → bump dies."
            />
            <SliderControl
              label="Excitation width a"
              value={localA}
              min={0.25}
              max={0.8}
              step={0.05}
              onChange={setLocalA}
              description="Controls how broadly each neuron excites its neighbours."
            />
            <SliderControl
              label="Noise level"
              value={localNoise}
              min={0}
              max={0.06}
              step={0.005}
              onChange={setLocalNoise}
              description="Stochastic perturbations that cause bump drift."
            />

            <div className="flex gap-2">
              <button
                onClick={applyParams}
                className="flex-1 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-lg px-3 py-2 text-sm transition-colors"
              >
                Apply & Reset
              </button>
              <button
                onClick={toggleStim}
                className="flex-1 border border-slate-600 hover:bg-slate-800 text-slate-300 font-semibold rounded-lg px-3 py-2 text-sm transition-colors"
              >
                {stimActive ? 'Hide cue' : 'Show cue'}
              </button>
            </div>

            <button
              onClick={onContinue}
              className="w-full border border-violet-700 hover:bg-violet-900/30 text-violet-300 font-semibold rounded-lg px-4 py-2 transition-colors text-sm"
            >
              Show the geometry behind this stability →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
