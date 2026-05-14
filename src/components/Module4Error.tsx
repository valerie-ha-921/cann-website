/**
 * Module 4: Noise → Behavioral Error — Connect Dynamics to Cognition
 *
 * Runs many repeated delay trials using the shared network parameters.
 * Each trial's final decoded angle becomes a "recalled angle."
 * The distribution of circular errors is displayed as a histogram.
 */

import { useState, useRef } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, Cell
} from 'recharts';
import { NarrativeStrip } from './NarrativeStrip';
import { MetricBadge } from './MetricBadge';
import { SliderControl } from './SliderControl';
import { UnderTheHood } from './UnderTheHood';
import { useNetworkStore } from '../store/networkStore';
import { runTrial } from '../simulation/engine';
import { dist } from '../simulation/dynamics';

const PI = Math.PI;

function circularMean(errors: number[]): number {
  const sinMean = errors.reduce((s, e) => s + Math.sin(e), 0) / errors.length;
  const cosMean = errors.reduce((s, e) => s + Math.cos(e), 0) / errors.length;
  return Math.atan2(sinMean, cosMean);
}

function circularVariance(errors: number[]): number {
  const R = Math.sqrt(
    Math.pow(errors.reduce((s, e) => s + Math.sin(e), 0) / errors.length, 2) +
    Math.pow(errors.reduce((s, e) => s + Math.cos(e), 0) / errors.length, 2)
  );
  return 1 - R;
}

function buildHistogram(errors: number[], bins: number): { bin: string; count: number; deg: number }[] {
  const binSize = 360 / bins;
  const counts = new Array(bins).fill(0);
  for (const e of errors) {
    const deg = e * 180 / PI;
    const idx = Math.floor((deg + 180) / binSize);
    if (idx >= 0 && idx < bins) counts[idx]++;
  }
  return counts.map((count, i) => ({
    bin: `${(-180 + i * binSize).toFixed(0)}°`,
    deg: -180 + i * binSize,
    count,
  }));
}

export function Module4Error({ onRestart }: { onRestart: () => void }) {
  const { net, cueAngle } = useNetworkStore();

  const [numTrials, setNumTrials] = useState(40);
  const [delaySteps, setDelaySteps] = useState(60);
  const [noiseLevel, setNoise] = useState(net.noiseLevel || 0.02);
  const [recurrentK, setRecurrentK] = useState(net.k);
  const [errors, setErrors] = useState<number[]>([]);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const cancelRef = useRef(false);
  const STIM_STEPS = 40;
  const DT = 0.05;
  const BINS = 24;

  const runAllTrials = async () => {
    cancelRef.current = false;
    setRunning(true);
    setErrors([]);
    setProgress(0);

    const newErrors: number[] = [];
    for (let i = 0; i < numTrials; i++) {
      if (cancelRef.current) break;
      // runTrial is CPU-heavy; yield to the browser each step
      await new Promise<void>(resolve => setTimeout(resolve, 0));

      const recalled = runTrial(
        { k: recurrentK, a: net.a, A: net.A, noiseLevel, N: net.N },
        cueAngle,
        STIM_STEPS,
        delaySteps,
        DT
      );
      const error = dist(recalled - cueAngle);
      newErrors.push(error);
      setProgress(i + 1);
      setErrors([...newErrors]);
    }
    setRunning(false);
  };

  const mae = errors.length > 0
    ? errors.reduce((s, e) => s + Math.abs(e), 0) / errors.length * 180 / PI
    : null;

  const circVar = errors.length > 1 ? circularVariance(errors) : null;
  const precision = circVar !== null ? (1 - circVar) : null;
  const meanErr = errors.length > 0 ? circularMean(errors) * 180 / PI : null;

  const histData = buildHistogram(errors, BINS);
  const maxCount = Math.max(...histData.map(d => d.count), 1);

  return (
    <div className="flex flex-col h-full">
      <NarrativeStrip
        moduleNum={4}
        question="How does neural drift become a measurable memory error?"
        subtitle="Run many trials with the same network. Noise causes the bump to drift — each final position is a recalled angle."
      />

      <div className="flex flex-1 overflow-hidden">
        {/* Main: histogram */}
        <div className="flex-1 flex flex-col items-center justify-center bg-slate-950 p-6 gap-4">

          {/* Histogram */}
          <div className="w-full max-w-[560px]">
            <p className="text-xs text-slate-500 font-mono mb-2 text-center">
              Circular error distribution (recalled − true cue) — {errors.length} / {numTrials} trials
            </p>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={histData} margin={{ left: 0, right: 0, top: 10, bottom: 20 }}>
                <XAxis
                  dataKey="bin"
                  tick={{ fill: '#475569', fontSize: 10, fontFamily: 'monospace' }}
                  interval={3}
                  label={{ value: 'Angular error (degrees)', position: 'insideBottom', offset: -10, fill: '#475569', fontSize: 11 }}
                />
                <YAxis
                  tick={{ fill: '#475569', fontSize: 10, fontFamily: 'monospace' }}
                  label={{ value: 'Count', angle: -90, position: 'insideLeft', fill: '#475569', fontSize: 11 }}
                />
                <Tooltip
                  contentStyle={{ background: '#1e293b', border: '1px solid #334155', color: '#cbd5e1', fontSize: 11 }}
                  formatter={(v) => [v, 'trials']}
                />
                <ReferenceLine x="0°" stroke="rgba(96,165,250,0.4)" strokeDasharray="4 4" />
                <Bar dataKey="count" radius={[2, 2, 0, 0]}>
                  {histData.map((entry, index) => {
                    const norm = entry.count / maxCount;
                    const isCenter = Math.abs(entry.deg) < 15;
                    return (
                      <Cell
                        key={index}
                        fill={isCenter
                          ? `rgba(52,211,153,${0.4 + norm * 0.6})`
                          : `rgba(139,92,246,${0.3 + norm * 0.6})`
                        }
                      />
                    );
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Progress bar */}
          {running && (
            <div className="w-full max-w-[560px]">
              <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 transition-all"
                  style={{ width: `${(progress / numTrials) * 100}%` }}
                />
              </div>
              <p className="text-xs text-slate-500 mt-1 text-center font-mono">
                Running trial {progress} / {numTrials}…
              </p>
            </div>
          )}

          {/* Metric summary row */}
          <div className="flex gap-3 flex-wrap justify-center">
            <MetricBadge label="Trials" value={errors.length} color="blue" />
            <MetricBadge label="Mean error" value={mae !== null ? `${mae.toFixed(1)}°` : '—'} color={mae && mae > 10 ? 'amber' : 'green'} />
            <MetricBadge label="Circ. variance" value={circVar !== null ? circVar.toFixed(3) : '—'} color="purple" />
            <MetricBadge label="Precision" value={precision !== null ? precision.toFixed(3) : '—'} color="green" />
            <MetricBadge label="Bias" value={meanErr !== null ? `${meanErr.toFixed(1)}°` : '—'} color="blue" />
          </div>
        </div>

        {/* Right panel */}
        <div className="w-80 flex flex-col border-l border-white/10 bg-slate-900/50 overflow-y-auto">
          <div className="p-5 space-y-4 flex-1">
            <div>
              <h3 className="text-sm font-semibold text-white mb-1">What to notice</h3>
              <p className="text-sm text-slate-400 leading-relaxed">
                With zero noise, all errors are near 0°. As noise increases, the distribution
                widens — the bump drifts more during the delay. Longer delays give noise more
                time to act. Stronger inhibition (k) stabilises the bump shape but doesn't
                prevent positional drift.
              </p>
            </div>

            <UnderTheHood
              equation={`tau · du_i/dt = −u_i + (Jxx·r)_i·dx + η_i\nη_i ~ N(0, σ²)`}
              explanation="Each trial adds a fresh noise draw at every integration step. The final bump position is decoded via center-of-mass. This maps directly to the behavioral error in a working memory task."
              code={`// One trial
function runTrial(params, z0, stimSteps, delaySteps, dt) {
  let state = warmStart(createNetwork(params));
  state = applyInput(state, params.A, z0);
  for (let i=0; i<stimSteps; i++) state = stepNetwork(state, dt);
  state = removeInput(state);
  for (let i=0; i<delaySteps; i++) state = stepNetwork(state, dt);
  return state.decodedAngle; // ← the "recall"
}`}
            />
          </div>

          <div className="p-5 border-t border-white/10 space-y-4">
            <h3 className="text-xs uppercase tracking-widest text-slate-500">Trial Parameters</h3>

            <SliderControl
              label="Number of trials"
              value={numTrials}
              min={10}
              max={100}
              step={10}
              onChange={setNumTrials}
              formatValue={v => `${v}`}
              description="More trials → smoother distribution, longer wait."
            />
            <SliderControl
              label="Delay duration"
              value={delaySteps}
              min={20}
              max={200}
              step={10}
              onChange={setDelaySteps}
              formatValue={v => `${v} steps`}
              description="More delay → more drift → wider error distribution."
            />
            <SliderControl
              label="Noise level σ"
              value={noiseLevel}
              min={0}
              max={0.06}
              step={0.005}
              onChange={setNoise}
              description="Drives bump drift; directly scales error variance."
            />
            <SliderControl
              label="Inhibition k"
              value={recurrentK}
              min={0.2}
              max={1.2}
              step={0.05}
              onChange={setRecurrentK}
              description="Changes bump stability — watch how it shifts error variance."
            />

            <div className="flex gap-2">
              <button
                onClick={runAllTrials}
                disabled={running}
                className="flex-1 bg-purple-700 hover:bg-purple-600 disabled:bg-slate-700 disabled:text-slate-500 text-white font-semibold rounded-lg px-3 py-2 text-sm transition-colors"
              >
                {running ? `Running (${progress}/${numTrials})` : 'Run Trials'}
              </button>
              <button
                onClick={() => { cancelRef.current = true; setRunning(false); }}
                disabled={!running}
                className="border border-slate-600 disabled:opacity-30 text-slate-300 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-slate-800"
              >
                Stop
              </button>
            </div>

            <button
              onClick={onRestart}
              className="w-full border border-slate-600 hover:bg-slate-800 text-slate-400 text-sm font-semibold rounded-lg px-4 py-2 transition-colors"
            >
              ↩ Restart from Module 1
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
