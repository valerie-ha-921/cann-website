/**
 * dynamics.ts
 * TypeScript port of the Fung-Wong-Wu CANN model (cann_base.py).
 * All functions are pure and stateless — they operate on plain number arrays.
 *
 * Model equations:
 *   tau du_i/dt = -u_i + sum_j W_ij r_j dx + I_i_ext + eta_i
 *   W_ij = exp(-0.5 * dist(x_i-x_j)^2 / a^2) / (sqrt(2pi) * a)
 *   r_i = max(u_i,0)^2 / (1 + (k/8) * sum_j max(u_j,0)^2 * dx / (sqrt(2pi)*a))
 *   I_i_ext = A * exp(-0.25 * dist(x_i - z0)^2 / a^2)
 */

const Z_MIN = -Math.PI;
const Z_RANGE = 2 * Math.PI;

/** Periodic angular distance — wraps so output is in (-pi, pi]. */
export function dist(c: number): number {
  let tmp = c % Z_RANGE;
  if (tmp < 0) tmp += Z_RANGE;
  if (tmp > 0.5 * Z_RANGE) tmp -= Z_RANGE;
  return tmp;
}

/** Element-wise dist for arrays. */
export function distArray(arr: number[]): number[] {
  return arr.map(dist);
}

/**
 * Create the preferred-stimulus array for N neurons.
 * Neurons are evenly spaced in [-pi, pi).
 */
export function createPreferredStimuli(N: number): number[] {
  const dx = Z_RANGE / N;
  return Array.from({ length: N }, (_, i) => (i + 0.5) * dx + Z_MIN);
}

/**
 * Build the NxN recurrent connectivity matrix (Jxx).
 * W_ij = exp(-0.5 * dist(x_i - x_j)^2 / a^2) / (sqrt(2pi) * a)
 * Returns a flat Float64Array in row-major order for speed.
 */
export function buildConnectivity(x: number[], a: number): Float64Array {
  const N = x.length;
  const Jxx = new Float64Array(N * N);
  const denom = Math.sqrt(2 * Math.PI) * a;
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      const d = dist(x[i] - x[j]);
      Jxx[i * N + j] = Math.exp(-0.5 * (d * d) / (a * a)) / denom;
    }
  }
  return Jxx;
}

/**
 * Compute firing rates with divisive normalization.
 * r_i = max(u_i,0)^2 / (1 + (k/8) * sum_j max(u_j,0)^2 * dx / (sqrt(2pi)*a))
 */
export function computeRates(u: Float64Array, k: number, dx: number, a: number): Float64Array {
  const N = u.length;
  const r = new Float64Array(N);
  let sumR = 0;
  for (let i = 0; i < N; i++) {
    const u0 = u[i] > 0 ? u[i] : 0;
    r[i] = u0 * u0;
    sumR += r[i];
  }
  const B = 1 + 0.125 * k * sumR * dx / (Math.sqrt(2 * Math.PI) * a);
  for (let i = 0; i < N; i++) r[i] /= B;
  return r;
}

/**
 * Compute du/dt for each neuron.
 * tau * du_i/dt = -u_i + (Jxx @ r)*dx + input_i
 */
export function getDudt(
  u: Float64Array,
  Jxx: Float64Array,
  r: Float64Array,
  input: Float64Array,
  dx: number,
  tau: number
): Float64Array {
  const N = u.length;
  const dudt = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    let recurrent = 0;
    const rowOffset = i * N;
    for (let j = 0; j < N; j++) {
      recurrent += Jxx[rowOffset + j] * r[j];
    }
    recurrent *= dx;
    dudt[i] = (-u[i] + recurrent + input[i]) / tau;
  }
  return dudt;
}

/**
 * Set external input centered at z0.
 * I_i = A * exp(-0.25 * dist(x_i - z0)^2 / a^2)
 */
export function setInput(x: number[], A: number, z0: number, a: number): Float64Array {
  const N = x.length;
  const inp = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    const d = dist(x[i] - z0);
    inp[i] = A * Math.exp(-0.25 * (d * d) / (a * a));
  }
  return inp;
}

/**
 * Zero external input.
 */
export function zeroInput(N: number): Float64Array {
  return new Float64Array(N);
}

/**
 * Center-of-mass decoder — returns the bump center angle in (-pi, pi].
 * Matches Fung's cm_of_u(): weights x positions by u, offset from the peak.
 */
export function decodeCenter(u: Float64Array, x: number[]): number {
  const N = u.length;
  let maxVal = -Infinity;
  let maxIdx = 0;
  for (let i = 0; i < N; i++) {
    if (u[i] > maxVal) { maxVal = u[i]; maxIdx = i; }
  }
  const xMax = x[maxIdx];
  let sumU = 0, weightedSum = 0;
  for (let i = 0; i < N; i++) {
    sumU += u[i];
    weightedSum += dist(x[i] - xMax) * u[i];
  }
  if (sumU === 0) return 0;
  return dist(weightedSum / sumU + xMax);
}

/**
 * Estimate bump amplitude (peak firing rate) and width (std of bump).
 */
export function bumpStats(r: Float64Array, x: number[]): { amplitude: number; width: number; center: number } {
  const N = r.length;
  let maxVal = 0, maxIdx = 0;
  for (let i = 0; i < N; i++) {
    if (r[i] > maxVal) { maxVal = r[i]; maxIdx = i; }
  }
  const center = x[maxIdx];
  let sumR = 0, sumR2 = 0;
  for (let i = 0; i < N; i++) {
    const d = dist(x[i] - center);
    sumR += r[i];
    sumR2 += r[i] * d * d;
  }
  const variance = sumR > 0 ? sumR2 / sumR : 0;
  return { amplitude: maxVal, width: Math.sqrt(variance), center };
}

/**
 * Classify network stability based on bump amplitude and total activity.
 */
export function classifyStability(
  r: Float64Array,
  prevAmplitude: number,
  amplitude: number
): 'dies' | 'stable' | 'runaway' | 'drifting' {
  const totalActivity = Array.from(r).reduce((s, v) => s + v, 0);
  if (totalActivity < 0.01) return 'dies';
  if (amplitude > 50) return 'runaway';
  if (Math.abs(amplitude - prevAmplitude) > 0.5) return 'drifting';
  return 'stable';
}

/**
 * Gaussian noise vector.
 */
export function gaussianNoise(N: number, sigma: number): Float64Array {
  const noise = new Float64Array(N);
  if (sigma === 0) return noise;
  for (let i = 0; i < N; i++) {
    // Box-Muller transform
    const u1 = Math.random();
    const u2 = Math.random();
    noise[i] = sigma * Math.sqrt(-2 * Math.log(u1 + 1e-12)) * Math.cos(2 * Math.PI * u2);
  }
  return noise;
}
