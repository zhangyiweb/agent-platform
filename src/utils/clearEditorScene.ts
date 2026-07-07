import * as THREE from 'three';
import { useSceneStore } from '@/store/sceneStore';
import { useLightStore } from '@/store/lightStore';
import { useAnimationStore } from '@/store/animationStore';
import { useParticleStore } from '@/store/particleStore';
import { disposeAllParticleSystems } from '@/utils/particleScene';
import { useHistoryStore } from '@/store/historyStore';
import { useTourStore } from '@/store/tourStore';
import { disposeObject3DResources, isEditorHelperObject } from '@/utils/sceneUtils';

function isProtectedSceneChild(child: THREE.Object3D): boolean {
  if (child.name === 'grid' || child.name === 'axes') return true;
  if (child.type === 'TransformControlsGizmo') return true;
  if (isEditorHelperObject(child)) return true;
  if (child.children.length === 2 && child.children[0]?.type === 'TransformControlsGizmo') return true;
  return false;
}

/** 清空编辑器场景与用户数据（保留网格、坐标轴、Gizmo） */
export function clearEditorScene() {
  const scene = (window as any).__editorScene as THREE.Scene | undefined;
  const transformControls = (window as any).__editorTransformControls as { detach?: () => void } | undefined;
  transformControls?.detach?.();

  if (scene) {
    const toRemove: THREE.Object3D[] = [];
    scene.children.forEach((child) => {
      if (isProtectedSceneChild(child)) return;
      toRemove.push(child);
    });
    toRemove.forEach((obj) => {
      scene.remove(obj);
      disposeObject3DResources(obj);
    });
  }

  useSceneStore.getState().clearScene();
  useSceneStore.getState().deselectAll();
  useAnimationStore.getState().clearTextureUvAnimations();
  disposeAllParticleSystems();
  useHistoryStore.getState().clear();
  useTourStore.getState().loadTours([], null);
  useLightStore.getState().replaceLights([]);
  useLightStore.getState().selectLight(null);
}
