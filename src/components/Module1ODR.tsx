/**
 * Module 1: ODR Task — Establish the Behavioral Problem
 *
 * The user sees a cue flash at an angle, waits through a delay period,
 * then sees where the network "remembers" the cue was.
 * This module sets z0 and seeds the shared state, but does NOT run
 * recurrent dynamics yet — that happens in Module 2.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { NarrativeStrip } from './NarrativeStrip';
import { MetricBadge } from './MetricBadge';
import { SliderControl } from './SliderControl';
import { UnderTheHood } from './UnderTheHood';
import { useNetworkStore } from '../store/networkStore';
import { dist } from '../simulation/dynamics';

type Phase = 'idle' | 'stimulus' | 'delay' | 'response';

function toDeg(rad: number) {
  return ((rad * 180) / Math.PI).toFixed(1);
}

function drawODR(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  cueAngle: number,
  phase: Phase,
  t: number,
  recalledAngle: number | null
) {
  ctx.clearRect(0, 0, w, h);

  const cx = w / 2, cy = h / 2;
  const R = Math.min(w, h) * 0.38;

  // Background
  ctx.fillStyle = '#0d1b2a';
  ctx.fillRect(0, 0, w, h);

  // Outer ring
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, 2 * Math.PI);
  ctx.stroke();

  // Tick marks every 30°
  for (let deg = 0; deg < 360; deg += 30) {
    const rad = (deg * Math.PI) / 180;
    const inner = R - (deg % 90 === 0 ? 12 : 6);
    ctx.beginPath();
    ctx.strokeStyle = deg % 90 === 0 ? '#475569' : '#1e3a5f';
    ctx.lineWidth = deg % 90 === 0 ? 1.5 : 1;
    ctx.moveTo(cx + Math.cos(rad) * inner, cy + Math.sin(rad) * inner);
    ctx.lineTo(cx + Math.cos(rad) * R, cy + Math.sin(rad) * R);
    ctx.stroke();
  }

  // Center dot
  ctx.beginPath();
  ctx.arc(cx, cy, 4, 0, 2 * Math.PI);
  ctx.fillStyle = '#475569';
  ctx.fill();

  // The cue angle is measured from 12 o'clock, clockwise → convert to canvas
  const cueCanvas = cueAngle - Math.PI / 2;
  const cueX = cx + Math.cos(cueCanvas) * R;
  const cueY = cy + Math.sin(cueCanvas) * R;

  // CUE FLASH (stimulus phase)
  if (phase === 'stimulus') {
    // Glowing sector
    const grad = ctx.createRadialGradient(cueX, cueY, 0, cueX, cueY, 30);
    grad.addColorStop(0, 'rgba(59,130,246,0.9)');
    grad.addColorStop(1, 'rgba(59,130,246,0)');
    ctx.beginPath();
    ctx.arc(cueX, cueY, 30, 0, 2 * Math.PI);
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(cueX, cueY, 8, 0, 2 * Math.PI);
    ctx.fillStyle = '#60a5fa';
    ctx.fill();

    // Line to center
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(96,165,250,0.3)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.moveTo(cx, cy);
    ctx.lineTo(cueX, cueY);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // DELAY — show fading ghost
  if (phase === 'delay') {
    const alpha = Math.max(0, 0.4 - t * 0.03);
    ctx.beginPath();
    ctx.arc(cueX, cueY, 8, 0, 2 * Math.PI);
    ctx.fillStyle = `rgba(96,165,250,${alpha})`;
    ctx.fill();

    // Clock-style sweep to show delay passing
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(100,116,139,0.5)';
    ctx.lineWidth = 2;
    ctx.arc(cx, cy, R * 0.15, -Math.PI / 2, -Math.PI / 2 + (t / 80) * 2 * Math.PI);
    ctx.stroke();
  }

  // RESPONSE — show true cue (faint) and recalled location
  if (phase === 'response' && recalledAngle !== null) {
    // True cue (ghost)
    ctx.beginPath();
    ctx.arc(cueX, cueY, 8, 0, 2 * Math.PI);
    ctx.fillStyle = 'rgba(96,165,250,0.25)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(96,165,250,0.5)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Recalled location
    const recCanvas = recalledAngle - Math.PI / 2;
    const recX = cx + Math.cos(recCanvas) * R;
    const recY = cy + Math.sin(recCanvas) * R;

    ctx.beginPath();
    ctx.arc(recX, recY, 10, 0, 2 * Math.PI);
    ctx.fillStyle = '#34d399';
    ctx.fill();

    // Error arc
    const errAngle = dist(recalledAngle - cueAngle);
    ctx.beginPath();
    ctx.strokeStyle = errAngle > 0.1 ? 'rgba(251,191,36,0.5)' : 'rgba(52,211,153,0.3)';
    ctx.lineWidth = 2;
    ctx.arc(cx, cy, R * 0.6, cueCanvas, recCanvas, errAngle < 0);
    ctx.stroke();

    // Labels
    ctx.fillStyle = 'rgba(96,165,250,0.8)';
    ctx.font = '11px monospace';
    ctx.fillText('True cue', cueX + 14, cueY - 5);
    ctx.fillStyle = '#34d399';
    ctx.fillText('Recalled', recX + 14, recY - 5);
  }

  // Phase label
  const phaseText: Record<Phase, string> = {
    idle: 'Press "Run Trial" to begin',
    stimulus: 'Stimulus presented',
    delay: 'Delay period — remember the location',
    response: 'Response decoded from network activity',
  };
  ctx.fillStyle = '#94a3b8';
  ctx.font = '12px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(phaseText[phase], cx, h - 20);
  ctx.textAlign = 'left';
}

export function Module1ODR({ onContinue }: { onContinue: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { cueAngle, setCueAngle, initNetwork, doWarmStart, presentCue, startDelay, tick, setPhase } = useNetworkStore();

  const [phase, setLocalPhase] = useState<Phase>('idle');
  const [_t, setT] = useState(0);
  const [delaySteps, setDelaySteps] = useState(60);
  const [recalledAngle, setRecalledAngle] = useState<number | null>(null);
  const [localCue, setLocalCue] = useState(cueAngle);
  const [noiseLevel, setNoise] = useState(0.01);
  // t is tracked via tRef for animation; setT triggers re-renders for metric display

  const phaseRef = useRef(phase);
  const tRef = useRef(0);
  const rafRef = useRef<number>(0);

  phaseRef.current = phase;

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    // Always read decoded angle fresh from the store to avoid stale closure
    const liveDecoded = useNetworkStore.getState().net.decodedAngle;
    drawODR(ctx, canvas.width, canvas.height, localCue, phaseRef.current, tRef.current,
      phaseRef.current === 'response' ? liveDecoded : null);
  }, [localCue]);

  // Animation loop
  useEffect(() => {
    let running = true;
    const loop = () => {
      if (!running) return;
      const p = phaseRef.current;

      if (p === 'stimulus') {
        tRef.current++;
        setT(tRef.current);
        // Run dynamics during stimulus so bump can track/confirm cue position
        tick(0.05);
        if (tRef.current >= 40) {
          phaseRef.current = 'delay';
          setLocalPhase('delay');
          tRef.current = 0;
          startDelay();
        }
      } else if (p === 'delay') {
        tRef.current++;
        setT(tRef.current);
        tick(0.05);
        if (tRef.current >= delaySteps) {
          phaseRef.current = 'response';
          setLocalPhase('response');
          // Read directly from the store — never from stale React closure
          const finalAngle = useNetworkStore.getState().net.decodedAngle;
          setRecalledAngle(finalAngle);
        }
      }

      draw();
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => { running = false; cancelAnimationFrame(rafRef.current); };
  }, [delaySteps, draw, startDelay, tick]);

  const runTrial = () => {
    tRef.current = 0;
    setT(0);
    setRecalledAngle(null);
    // Set cue angle BEFORE initNetwork + doWarmStart so the warm-start
    // centres the bump at localCue (not at 0).
    setCueAngle(localCue);
    initNetwork({ noiseLevel });
    // doWarmStart now reads cueAngle from the store and seeds the bump there
    doWarmStart();
    // stimulus phase: input confirms cue position, dynamics run in the loop
    presentCue();
    phaseRef.current = 'stimulus';
    setLocalPhase('stimulus');
    setPhase('Stimulus');
  };

  const errorDeg = recalledAngle !== null
    ? Math.abs(dist(recalledAngle - localCue) * 180 / Math.PI)
    : null;

  return (
    <div className="flex flex-col h-full">
      <NarrativeStrip
        moduleNum={1}
        question="Where is the memory while the cue is gone?"
        subtitle="A cue flashes briefly, then disappears. Watch where the network thinks it was."
      />

      <div className="flex flex-1 overflow-hidden">
        {/* Main canvas */}
        <div className="flex-1 flex items-center justify-center bg-slate-950 p-6">
          <canvas
            ref={canvasRef}
            width={440}
            height={440}
            className="rounded-xl border border-slate-800 shadow-2xl"
          />
        </div>

        {/* Right panel */}
        <div className="w-80 flex flex-col border-l border-white/10 bg-slate-900/50 overflow-y-auto">
          <div className="p-5 space-y-4 flex-1">
            <div>
              <h3 className="text-sm font-semibold text-white mb-1">What to notice</h3>
              <p className="text-sm text-slate-400 leading-relaxed">
                After the stimulus disappears, the network must maintain the location in
                memory with <em>no external input</em>. Any drift in the internal activity
                state becomes a recall error.
              </p>
            </div>

            {/* Metric badges */}
            <div className="grid grid-cols-2 gap-2">
              <MetricBadge label="Cue" value={`${toDeg(localCue)}°`} color="blue" />
              <MetricBadge
                label="Recalled"
                value={recalledAngle !== null ? `${toDeg(recalledAngle)}°` : '—'}
                color="green"
              />
              <MetricBadge
                label="Error"
                value={errorDeg !== null ? `${errorDeg.toFixed(1)}°` : '—'}
                color={errorDeg !== null && errorDeg > 5 ? 'amber' : 'green'}
              />
              <MetricBadge label="Phase" value={phase} color="purple" />
            </div>

            <UnderTheHood
              equation="I_i = A · exp(−0.25 · dist(x_i − z₀)² / a²)"
              explanation="The external cue drives neurons near angle z₀ with a Gaussian profile. When the cue disappears, I_i → 0 and only recurrent activity remains."
              code={`function setInput(x, A, z0, a) {
  return x.map(xi => {
    const d = dist(xi - z0);
    return A * Math.exp(-0.25*d*d/(a*a));
  });
}`}
            />
          </div>

          {/* Controls */}
          <div className="p-5 border-t border-white/10 space-y-4">
            <h3 className="text-xs uppercase tracking-widest text-slate-500">Controls</h3>

            <SliderControl
              label="Cue angle"
              value={localCue}
              min={-Math.PI}
              max={Math.PI}
              step={0.05}
              onChange={v => setLocalCue(v)}
              formatValue={v => `${toDeg(v)}°`}
              description="Where the stimulus will appear on the ring."
            />
            <SliderControl
              label="Delay duration"
              value={delaySteps}
              min={20}
              max={200}
              step={10}
              onChange={setDelaySteps}
              formatValue={v => `${v} steps`}
              description="How long the network maintains the memory with no input."
            />
            <SliderControl
              label="Noise level"
              value={noiseLevel}
              min={0}
              max={0.08}
              step={0.005}
              onChange={setNoise}
              description="Random perturbations injected each step — cause drift."
            />

            <button
              onClick={runTrial}
              disabled={phase === 'stimulus' || phase === 'delay'}
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white font-semibold rounded-lg px-4 py-2.5 transition-colors text-sm"
            >
              {phase === 'idle' || phase === 'response' ? 'Run Trial' : 'Running…'}
            </button>

            <button
              onClick={onContinue}
              className="w-full border border-indigo-700 hover:bg-indigo-900/30 text-indigo-300 font-semibold rounded-lg px-4 py-2 transition-colors text-sm"
            >
              Show where this memory lives in the network →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
