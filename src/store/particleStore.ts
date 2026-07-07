import { create } from 'zustand';
import type { ParticleEmitterConfig } from '@/types/particle';
import { DEFAULT_PARTICLE_CONFIG } from '@/types/particle';

interface ParticleStore {
  emitters: Record<string, ParticleEmitterConfig>;
  getEmitter: (id: string) => ParticleEmitterConfig;
  setEmitter: (id: string, config: ParticleEmitterConfig) => void;
  updateEmitter: (id: string, updates: Partial<ParticleEmitterConfig>) => void;
  removeEmitter: (id: string) => void;
  replaceEmitters: (emitters: Record<string, ParticleEmitterConfig>) => void;
  clearEmitters: () => void;
}

export const useParticleStore = create<ParticleStore>((set, get) => ({
  emitters: {},

  getEmitter: (id) => get().emitters[id] ?? { ...DEFAULT_PARTICLE_CONFIG },

  setEmitter: (id, config) =>
    set((state) => ({
      emitters: { ...state.emitters, [id]: { ...config } },
    })),

  updateEmitter: (id, updates) =>
    set((state) => ({
      emitters: {
        ...state.emitters,
        [id]: {
          ...DEFAULT_PARTICLE_CONFIG,
          ...state.emitters[id],
          ...updates,
        },
      },
    })),

  removeEmitter: (id) =>
    set((state) => {
      const next = { ...state.emitters };
      delete next[id];
      return { emitters: next };
    }),

  replaceEmitters: (emitters) => set({ emitters: { ...emitters } }),

  clearEmitters: () => set({ emitters: {} }),
}));
