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
