import * as THREE from 'three';

/** 根据业务 ID / UUID 在场景中查找 Three.js 对象 */
export function findThreeObjectById(
  scene: THREE.Scene,
  id: string,
  getThreeObject?: (id: string) => THREE.Object3D | undefined
): THREE.Object3D | null {
  const fromStore = getThreeObject?.(id);
  if (fromStore) return fromStore;

  let found: THREE.Object3D | null = null;
  scene.traverse((child) => {
    if (
      child.uuid === id ||
      child.userData?.id === id ||
      child.userData?.businessId === id
    ) {
      found = child;
    }
  });
  return found;
}

/** 判断对象是否为编辑器辅助对象（不应导出） */
export function isEditorHelperObject(obj: THREE.Object3D): boolean {
  if (obj.name === 'grid' || obj.name === 'axes') return true;
  if (obj.name.startsWith('helper_')) return true;
  if (obj.type === 'TransformControlsGizmo') return true;

  let parent = obj.parent;
  while (parent) {
    if (parent.type === 'TransformControlsGizmo') return true;
    parent = parent.parent;
  }
  return false;
}

/** 创建用于导出的场景副本（仅模型，不含灯光与辅助对象） */
export function createModelsExportScene(source: THREE.Scene): THREE.Scene {
  const exportScene = new THREE.Scene();

  source.children.forEach((child) => {
    if (isEditorHelperObject(child)) return;
    if (child instanceof THREE.Light) return;
    if (child.userData?.isLightTarget) return;
    if (
      child instanceof THREE.Mesh ||
      child instanceof THREE.Group ||
      child instanceof THREE.Line ||
      child instanceof THREE.LineSegments
    ) {
      exportScene.add(child.clone(true));
    }
  });

  return exportScene;
}

/** 创建用于导出的场景副本，排除网格、坐标轴、Gizmo 等辅助对象 */
export function createExportScene(source: THREE.Scene): THREE.Scene {
  const exportScene = new THREE.Scene();

  source.children.forEach((child) => {
    if (isEditorHelperObject(child)) return;
    if (child instanceof THREE.Light) {
      exportScene.add(child.clone());
      return;
    }
    if (child instanceof THREE.Mesh || child instanceof THREE.Group) {
      exportScene.add(child.clone(true));
    }
  });

  return exportScene;
}

const DISPOSE_TEXTURE_KEYS = [
  'map',
  'normalMap',
  'roughnessMap',
  'metalnessMap',
  'emissiveMap',
  'aoMap',
  'bumpMap',
  'alphaMap',
  'displacementMap',
] as const;

function disposeMaterial(material: THREE.Material) {
  DISPOSE_TEXTURE_KEYS.forEach((key) => {
    const texture = (material as unknown as Record<string, THREE.Texture | undefined>)[key];
    texture?.dispose();
  });
  material.dispose();
}

/** 释放 Object3D 及其子节点占用的 GPU 资源 */
export function disposeObject3DResources(root: THREE.Object3D | null | undefined) {
  if (!root) return;
  root.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.geometry?.dispose();
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach((material) => {
        if (material) disposeMaterial(material);
      });
      return;
    }

    if (child instanceof THREE.Line || child instanceof THREE.LineSegments) {
      child.geometry?.dispose();
      const lineMat = child.material;
      if (Array.isArray(lineMat)) {
        lineMat.forEach((material) => material?.dispose());
      } else {
        lineMat?.dispose();
      }
    }
  });
}
