import * as THREE from 'three';
import { useSceneStore } from '@/store/sceneStore';
import { findThreeObjectById } from '@/utils/sceneUtils';
import {
  readTextureUvState,
  type ExportedTextureUvState,
} from '@/utils/textureUvUtils';

export type { ExportedTextureUvState };

/** 导出前：确保 GLB 节点携带业务 id（clone 会复制 userData；此处补齐缺失项） */
export function stampModelUserDataForExport(exportScene: THREE.Scene) {
  const { objects, getThreeObject } = useSceneStore.getState();

  // 按名称补齐顶层缺失 id（clone 后 uuid 会变，不能靠 uuid 对齐）
  exportScene.children.forEach((child) => {
    if (child.userData?.id) {
      child.userData.businessId = child.userData.id;
      return;
    }
    const matched = objects.find((obj) => {
      const source = getThreeObject(obj.id);
      return source?.name && source.name === child.name;
    });
    if (!matched) return;
    child.userData.id = matched.id;
    child.userData.businessId = matched.id;
  });

  exportScene.traverse((child) => {
    const id = child.userData?.id || child.userData?.editorId || child.userData?.businessId;
    if (!id) return;
    child.userData.id = id;
    child.userData.businessId = id;
  });
}

/** 收集场景中所有带贴图对象的 UV 状态，供导出项目恢复 */
export function collectTextureUvStates(scene: THREE.Scene): Record<string, ExportedTextureUvState> {
  const states: Record<string, ExportedTextureUvState> = {};
  const { objects, getThreeObject } = useSceneStore.getState();

  objects.forEach((obj) => {
    const root = getThreeObject(obj.id) || findThreeObjectById(scene, obj.id);
    if (!root) return;

    root.traverse((child) => {
      if (!(child instanceof THREE.Mesh) || states[obj.id]) return;
      const material = child.material as THREE.MeshStandardMaterial;
      if (!material?.map) return;
      states[obj.id] = readTextureUvState(material.map);
    });
  });

  return states;
}

/** 根据 editor.objects 为加载的模型恢复业务 id */
export function restoreEditorObjectIds(
  modelRoot: THREE.Object3D,
  editorObjects: Array<{ id: string; name: string }>
) {
  if (!modelRoot || !editorObjects?.length) return;

  const pending = [...editorObjects];

  const bind = (node: THREE.Object3D) => {
    if (!node || node.userData?.id) return;
    const index = pending.findIndex((item) => item.name && item.name === node.name);
    if (index < 0) return;
    node.userData.id = pending[index].id;
    node.userData.businessId = pending[index].id;
    pending.splice(index, 1);
  };

  bind(modelRoot);
  modelRoot.traverse((child) => {
    if (child !== modelRoot) bind(child);
  });

  if (!modelRoot.userData?.id && pending.length === 1 && editorObjects.length === 1) {
    modelRoot.userData.id = pending[0].id;
    modelRoot.userData.businessId = pending[0].id;
  }
}

/** 根据 editor.objects 为运行时生成的 JS 恢复 id（写入导出模板） */
export function buildObjectIdRestoreScript(): string {
  return `
function restoreEditorObjectIds(modelRoot, editorObjects) {
  if (!modelRoot || !editorObjects?.length) return;
  const pending = [...editorObjects];

  const bind = (node) => {
    if (!node || node.userData?.id) return;
    const index = pending.findIndex((item) => item.name && item.name === node.name);
    if (index < 0) return;
    node.userData.id = pending[index].id;
    pending.splice(index, 1);
  };

  bind(modelRoot);
  modelRoot.traverse((child) => {
    if (child !== modelRoot) bind(child);
  });

  if (!modelRoot.userData?.id && pending.length === 1 && editorObjects.length === 1) {
    modelRoot.userData.id = pending[0].id;
  }
}

function applyTextureUvStates(modelRoot, states) {
  if (!modelRoot || !states) return;
  Object.entries(states).forEach(([objectId, state]) => {
    const target = findObjectById(modelRoot, objectId) || findObjectById(modelRoot.parent || modelRoot, objectId);
    if (!target || !state) return;
    target.traverse((child) => {
      if (!child.isMesh) return;
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach((mat) => {
        if (!mat?.map) return;
        mat.map.repeat.set(state.repeat?.[0] ?? 1, state.repeat?.[1] ?? 1);
        mat.map.offset.set(state.offset?.[0] ?? 0, state.offset?.[1] ?? 0);
        mat.map.wrapS = state.wrapS ?? THREE.RepeatWrapping;
        mat.map.wrapT = state.wrapT ?? THREE.RepeatWrapping;
        mat.map.rotation = state.rotation ?? 0;
        mat.map.needsUpdate = true;
      });
    });
  });
}

function prepareTextureAnimations(modelRoot, animations) {
  if (!modelRoot || !animations) return;
  Object.entries(animations).forEach(([objectId, cfg]) => {
    if (!cfg?.enabled) return;
    const target = findObjectById(modelRoot, objectId) || findObjectById(modelRoot.parent || modelRoot, objectId);
    if (!target) return;
    const keys = cfg.target === 'all'
      ? ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap', 'bumpMap']
      : ['map'];
    target.traverse((child) => {
      if (!child.isMesh) return;
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach((mat) => {
        keys.forEach((key) => {
          const tex = mat?.[key];
          if (!tex) return;
          tex.wrapS = THREE.RepeatWrapping;
          tex.wrapT = THREE.RepeatWrapping;
          tex.needsUpdate = true;
        });
      });
    });
  });
}
`.trim();
}
