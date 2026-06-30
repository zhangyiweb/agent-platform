import { create } from 'zustand';
import {
  DEFAULT_TEXTURE_UV_ANIMATION,
  type TextureUvAnimationConfig,
} from '@/types/textureAnimation';

interface AnimationStore {
  textureUvAnimations: Record<string, TextureUvAnimationConfig>;
  getTextureUvAnimation: (objectId: string) => TextureUvAnimationConfig;
  setTextureUvAnimation: (objectId: string, updates: Partial<TextureUvAnimationConfig>) => void;
  removeTextureUvAnimation: (objectId: string) => void;
  clearTextureUvAnimations: () => void;
}

export const useAnimationStore = create<AnimationStore>((set, get) => ({
  textureUvAnimations: {},

  getTextureUvAnimation: (objectId) =>
    get().textureUvAnimations[objectId] ?? { ...DEFAULT_TEXTURE_UV_ANIMATION },

  setTextureUvAnimation: (objectId, updates) =>
    set((state) => ({
      textureUvAnimations: {
        ...state.textureUvAnimations,
        [objectId]: {
          ...DEFAULT_TEXTURE_UV_ANIMATION,
          ...state.textureUvAnimations[objectId],
          ...updates,
        },
      },
    })),

  removeTextureUvAnimation: (objectId) =>
    set((state) => {
      const next = { ...state.textureUvAnimations };
      delete next[objectId];
      return { textureUvAnimations: next };
    }),

  clearTextureUvAnimations: () => set({ textureUvAnimations: {} }),
}));
