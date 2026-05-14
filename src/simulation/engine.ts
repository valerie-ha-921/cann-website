/**
 * engine.ts
 * High-level simulation API — creates and steps network state.
 * All heavy math lives in dynamics.ts.
 */

import {
  createPreferredStimuli,
  buildConnectivity,
  computeRates,
  getDudt,
  setInput,
  zeroInput,
  decodeCenter,
  bumpStats,
  gaussianNoise,
  classifyStability,
} from './dynamics';

export interface NetworkState {
  // Neuron geometry
  N: number;
  x: number[];          // preferred stimulus angle of each unit
  dx: number;

  // Dynamics buffers
  u: Float64Array;      // synaptic input / membrane potential
  r: Float64Array;      // firing rate (after divisive inhibition)
  Jxx: Float64Array;    // recurrent connectivity (flat row-major N×N)
  input: Float64Array;  // external stimulus drive

  // Parameters
  tau: number;
  k: number;            // global inhibition strength
  a: number;            // excitatory connection width
  A: number;            // external input magnitude
  z0: number | null;    // current stimulus location
  noiseLevel: number;

  // Decoded state
  bumpCenter: number;
  decodedAngle: number;
  bumpWidth: number;
  bumpAmplitude: number;

  // Meta
  time: number;
  stabilityLabel: 'dies' | 'stable' | 'runaway' | 'drifting';
}

/** Default parameters matching the Fung reference script. */
export const DEFAULT_PARAMS = {
  N: 128,
  tau: 1.0,
  k: 0.5,
  a: 0.5,
  A: 0.5,
  noiseLevel: 0.01,
};

/**
 * Create a fresh network at rest (u=0, r=0, no input).
 */
export function createNetwork(params: Partial<typeof DEFAULT_PARAMS> = {}): NetworkState {
  const { N, tau, k, a, A, noiseLevel } = { ...DEFAULT_PARAMS, ...params };
  const x = createPreferredStimuli(N);
  const dx = (2 * Math.PI) / N;
  const Jxx = buildConnectivity(x, a);
  const u = new Float64Array(N);
  const r = new Float64Array(N);
  const input = new Float64Array(N);

  return {
    N, x, dx,
    u, r, Jxx, input,
    tau, k, a, A,
    z0: null,
    noiseLevel,
    bumpCenter: 0,
    decodedAngle: 0,
    bumpWidth: 0,
    bumpAmplitude: 0,
    time: 0,
    stabilityLabel: 'stable',
  };
}

/**
 * Warm-start: seed u from a strong input at z0 so the bump forms quickly.
 * Matches the Fung script's initialization heuristic.
 * @param z0 - angle to centre the bump at (default 0)
 */
export function warmStart(state: NetworkState, z0 = 0): NetworkState {
  const seedA = state.k < 1.0 ? Math.sqrt(32) / state.k : Math.sqrt(32);
  const seedInput = setInput(state.x, seedA, z0, state.a);
  const u = new Float64Array(state.N);
  for (let i = 0; i < state.N; i++) u[i] = seedInput[i];
  // Run ~30 Euler steps to settle
  let uCur = u;
  const dt = 0.05;
  for (let step = 0; step < 600; step++) {
    const r = computeRates(uCur, state.k, state.dx, state.a);
    const noise = gaussianNoise(state.N, 0); // no noise during init
    const dudt = getDudt(uCur, state.Jxx, r, seedInput, state.dx, state.tau);
    const uNext = new Float64Array(state.N);
    for (let i = 0; i < state.N; i++) {
      uNext[i] = uCur[i] + dt * dudt[i] + noise[i];
    }
    uCur = uNext;
  }
  const r = computeRates(uCur, state.k, state.dx, state.a);
  const stats = bumpStats(r, state.x);
  const decoded = decodeCenter(uCur, state.x);
  return {
    ...state,
    u: uCur,
    r,
    bumpCenter: stats.center,
    decodedAngle: decoded,
    bumpWidth: stats.width,
    bumpAmplitude: stats.amplitude,
    stabilityLabel: 'stable',
  };
}

/**
 * Advance the network by one Euler step of size dt.
 * Optionally injects noise.
 */
export function stepNetwork(state: NetworkState, dt: number): NetworkState {
  const { u, Jxx, input, k, dx, a, tau, noiseLevel, x, N } = state;

  const r = computeRates(u, k, dx, a);
  const noise = gaussianNoise(N, noiseLevel);
  const dudt = getDudt(u, Jxx, r, input, dx, tau);

  const uNext = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    uNext[i] = u[i] + dt * dudt[i] + noise[i];
  }

  const rNext = computeRates(uNext, k, dx, a);
  const stats = bumpStats(rNext, x);
  const decoded = decodeCenter(uNext, x);
  const stability = classifyStability(rNext, state.bumpAmplitude, stats.amplitude);

  return {
    ...state,
    u: uNext,
    r: rNext,
    bumpCenter: stats.center,
    decodedAngle: decoded,
    bumpWidth: stats.width,
    bumpAmplitude: stats.amplitude,
    stabilityLabel: stability,
    time: state.time + dt,
  };
}

/**
 * Apply external input to the network (or remove it with A=0).
 */
export function applyInput(state: NetworkState, A: number, z0: number): NetworkState {
  const input = setInput(state.x, A, z0, state.a);
  return { ...state, input, z0, A };
}

/**
 * Remove external input (delay / maintenance period).
 */
export function removeInput(state: NetworkState): NetworkState {
  return { ...state, input: zeroInput(state.N), z0: null };
}

/**
 * Rebuild Jxx and restart from rest when parameters change.
 */
export function resetNetwork(state: NetworkState, params: Partial<typeof DEFAULT_PARAMS> = {}): NetworkState {
  const merged = { ...state, ...params };
  const fresh = createNetwork({
    N: merged.N,
    tau: merged.tau,
    k: merged.k,
    a: merged.a,
    A: merged.A,
    noiseLevel: merged.noiseLevel,
  });
  return fresh;
}

/**
 * Run a single ODR trial: apply cue for stimDuration steps,
 * then run for delayDuration steps with noise, return final decoded angle.
 */
export function runTrial(
  params: { N?: number; k: number; a: number; A: number; noiseLevel: number },
  z0: number,
  stimSteps: number,
  delaySteps: number,
  dt: number
): number {
  let state = createNetwork(params);
  state = warmStart(state);
  // Move bump to z0
  state = applyInput(state, params.A, z0);
  for (let i = 0; i < stimSteps; i++) state = stepNetwork(state, dt);
  // Delay: no input, with noise
  state = removeInput(state);
  for (let i = 0; i < delaySteps; i++) state = stepNetwork(state, dt);
  return state.decodedAngle;
}
