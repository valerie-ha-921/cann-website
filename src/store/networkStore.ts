/**
 * networkStore.ts
 * Zustand store — single source of truth for CANN simulation state.
 * Every module reads from and writes to this store.
 */

import { create } from 'zustand';
import type { NetworkState } from '../simulation/engine';
import {
  DEFAULT_PARAMS,
  createNetwork,
  warmStart,
  stepNetwork,
  applyInput,
  removeInput,
  resetNetwork,
} from '../simulation/engine';

interface StoreState {
  net: NetworkState;
  isRunning: boolean;
  cueAngle: number;          // the user-chosen cue angle (z0)
  currentModule: number;     // 1 | 2 | 3 | 4
  trialErrors: number[];     // accumulated errors from Module 4
  phaseLabel: string;        // "Stimulus" | "Delay" | "Response"

  // Actions
  initNetwork: (params?: Partial<typeof DEFAULT_PARAMS>) => void;
  doWarmStart: () => void;
  setCueAngle: (angle: number) => void;
  presentCue: () => void;
  startDelay: () => void;
  tick: (dt: number) => void;
  setParam: (key: keyof typeof DEFAULT_PARAMS, value: number) => void;
  setNoiseLevel: (v: number) => void;
  goToModule: (m: number) => void;
  resetExperiment: () => void;
  addTrialError: (err: number) => void;
  clearTrialErrors: () => void;
  setPhase: (label: string) => void;
  perturbBump: (shiftAngle: number, shapeScale: number) => void;
}

export const useNetworkStore = create<StoreState>((set, get) => ({
  net: createNetwork(),
  isRunning: false,
  cueAngle: Math.PI / 2,
  currentModule: 1,
  trialErrors: [],
  phaseLabel: 'Idle',

  initNetwork(params = {}) {
    set({ net: createNetwork(params), trialErrors: [], phaseLabel: 'Idle' });
  },

  doWarmStart() {
    // Settle the bump at the current cue angle so Module 1 starts
    // with the memory already positioned — delay then shows the drift.
    const warmed = warmStart(get().net, get().cueAngle);
    set({ net: warmed });
  },

  setCueAngle(angle) {
    set({ cueAngle: angle });
  },

  presentCue() {
    const { net, cueAngle } = get();
    const updated = applyInput(net, net.A, cueAngle);
    set({ net: updated, phaseLabel: 'Stimulus' });
  },

  startDelay() {
    const updated = removeInput(get().net);
    set({ net: updated, phaseLabel: 'Delay' });
  },

  tick(dt) {
    const stepped = stepNetwork(get().net, dt);
    set({ net: stepped });
  },

  setParam(key, value) {
    const { net } = get();
    // Parameters that require a full rebuild
    if (key === 'N' || key === 'a') {
      const rebuilt = resetNetwork(net, { [key]: value });
      set({ net: rebuilt });
    } else {
      // Parameters that can be hot-patched
      set({ net: { ...net, [key]: value } });
    }
  },

  setNoiseLevel(v) {
    set({ net: { ...get().net, noiseLevel: v } });
  },

  goToModule(m) {
    set({ currentModule: m });
  },

  resetExperiment() {
    set({
      net: createNetwork(),
      trialErrors: [],
      phaseLabel: 'Idle',
      currentModule: 1,
      cueAngle: Math.PI / 2,
    });
  },

  addTrialError(err) {
    set({ trialErrors: [...get().trialErrors, err] });
  },

  clearTrialErrors() {
    set({ trialErrors: [] });
  },

  setPhase(label) {
    set({ phaseLabel: label });
  },

  perturbBump(shiftAngle, shapeScale) {
    const { net } = get();
    const N = net.N;
    const uNew = new Float64Array(N);
    for (let i = 0; i < N; i++) {
      // position perturbation: shift preferred angle
      // shape perturbation: scale amplitude
      uNew[i] = net.u[i] * shapeScale;
    }
    // For position shift, rotate bump by shifting u array by shift index
    const shiftIdx = Math.round((shiftAngle / (2 * Math.PI)) * N);
    const uShifted = new Float64Array(N);
    for (let i = 0; i < N; i++) {
      uShifted[i] = uNew[(i - shiftIdx + N) % N];
    }
    set({ net: { ...net, u: uShifted } });
  },
}));
