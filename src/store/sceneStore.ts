import { create } from 'zustand';
import type { SceneState, SceneObject, CameraConfig } from '@/types/scene';
import * as THREE from 'three';
import { useAnimationStore } from '@/store/animationStore';
import { disposeParticleSystem } from '@/utils/particleScene';

interface SceneStore extends SceneState {
  // Three.js对象映射 (业务ID -> Three.js对象)
  threeObjects: Map<string, THREE.Object3D>;
  
  // 注册Three.js对象
  registerThreeObject: (id: string, object: THREE.Object3D) => void;
  
  // 获取Three.js对象
  getThreeObject: (id: string) => THREE.Object3D | undefined;
  
  // 移除Three.js对象映射
  removeThreeObject: (id: string) => void;
  
  // 添加对象 (别名)
  addSceneObject: (object: SceneObject) => void;
  
  // 添加对象
  addObject: (object: SceneObject) => void;
  
  // 移除对象
  removeObject: (id: string) => void;
  
  // 选择对象
  selectObject: (id: string, multi?: boolean) => void;
  
  // 取消选择
  deselectAll: () => void;
  
  // 更新对象
  updateObject: (id: string, updates: Partial<SceneObject>) => void;
  
  // 更新相机
  updateCamera: (camera: Partial<CameraConfig>) => void;
  
  // 清空场景
  clearScene: () => void;
}

const initialState: SceneState = {
  objects: [],
  selectedIds: [],
  camera: {
    position: [10, 10, 10], // 初始相机坐标(10, 10, 10)
    target: [0, 0, 0],
    fov: 45, // 默认45度视野
    near: 0.1,
    far: 5000,
  },
  lights: [],
  backgroundColor: '#1a1a1a',
};

export const useSceneStore = create<SceneStore>((set, get) => ({
  ...initialState,
  threeObjects: new Map(),

  registerThreeObject: (id, object) =>
    set((state) => {
      const newMap = new Map(state.threeObjects);
      newMap.set(id, object);
      return { threeObjects: newMap };
    }),

  getThreeObject: (id) => get().threeObjects.get(id),

  removeThreeObject: (id) =>
    set((state) => {
      const newMap = new Map(state.threeObjects);
      newMap.delete(id);
      return { threeObjects: newMap };
    }),

  addSceneObject: (object) =>
    set((state) => ({
      objects: [...state.objects, object],
    })),

  addObject: (object) =>
    set((state) => ({
      objects: [...state.objects, object],
    })),

  removeObject: (id) =>
    set((state) => {
      const newMap = new Map(state.threeObjects);
      newMap.delete(id);
      useAnimationStore.getState().removeTextureUvAnimation(id);
      disposeParticleSystem(id);
      return {
        objects: state.objects.filter((obj) => obj.id !== id),
        selectedIds: state.selectedIds.filter((sid) => sid !== id),
        threeObjects: newMap,
      };
    }),

  selectObject: (id, multi = false) =>
    set((state) => ({
      selectedIds: multi
        ? state.selectedIds.includes(id)
          ? state.selectedIds.filter((sid) => sid !== id)
          : [...state.selectedIds, id]
        : [id],
    })),

  deselectAll: () => set({ selectedIds: [] }),

  updateObject: (id, updates) =>
    set((state) => ({
      objects: state.objects.map((obj) =>
        obj.id === id ? { ...obj, ...updates } : obj
      ),
    })),

  updateCamera: (camera) =>
    set((state) => ({
      camera: { ...state.camera, ...camera },
    })),

  clearScene: () =>
    set({
      objects: [],
      selectedIds: [],
      threeObjects: new Map(),
    }),
}));
