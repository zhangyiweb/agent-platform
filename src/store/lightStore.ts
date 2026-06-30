import { create } from 'zustand';
import type { LightState, LightConfig, LightAction } from '@/types/light';
import { DEFAULT_LIGHTS } from '@/config/defaultLighting';

interface LightStore extends LightState {
  // 添加灯光，返回新灯光 ID
  addLight: (config: Omit<LightConfig, 'id'>) => string;
  
  // 移除灯光
  removeLight: (id: string) => void;
  
  // 更新灯光
  updateLight: (id: string, updates: Partial<LightConfig>) => void;
  
  // 选择灯光
  selectLight: (id: string | null) => void;
  
  // 切换灯光开关
  toggleLight: (id: string) => void;
  
  // 记录操作 (用于撤销/重做)
  recordAction: (action: LightAction) => void;
  
  // 重置所有灯光
  resetLights: () => void;
}

const initialState: LightState = {
  lights: [...DEFAULT_LIGHTS],
  selectedLightId: null,
};

export const useLightStore = create<LightStore>((set) => ({
  ...initialState,

  addLight: (config) => {
    const id = `light_${Date.now()}`;
    const newLight: LightConfig = {
      ...config,
      id,
      name: config.name || `${config.type}_${id.slice(-4)}`,
      enabled: config.enabled ?? true,
      castShadow: config.castShadow ?? false,
    };

    set((state) => ({
      lights: [...state.lights, newLight],
    }));

    return id;
  },

  removeLight: (id) =>
    set((state) => ({
      lights: state.lights.filter((light) => light.id !== id),
      selectedLightId: state.selectedLightId === id ? null : state.selectedLightId,
    })),

  updateLight: (id, updates) =>
    set((state) => ({
      lights: state.lights.map((light) =>
        light.id === id ? { ...light, ...updates } : light
      ),
    })),

  selectLight: (id) => set({ selectedLightId: id }),

  toggleLight: (id) =>
    set((state) => ({
      lights: state.lights.map((light) =>
        light.id === id ? { ...light, enabled: !light.enabled } : light
      ),
    })),

  recordAction: (action) => {
    // TODO: 集成到历史记录系统
  },

  resetLights: () => set(initialState),
}));
