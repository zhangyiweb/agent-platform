import * as THREE from 'three';
import { useSceneStore } from '@/store/sceneStore';
import { useEditorStore } from '@/store/editorStore';

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

/** 将场景中已注册对象的变换同步回 store（保存前调用，避免 store 与视口不一致） */
export function syncSceneObjectsToStore(scene: THREE.Scene) {
  const { objects, getThreeObject, updateObject } = useSceneStore.getState();

  objects.forEach((obj) => {
    const threeObj = getThreeObject(obj.id) || findThreeObjectById(scene, obj.id, getThreeObject);
    if (!threeObj) return;

    updateObject(obj.id, {
      name: threeObj.name || obj.name,
      visible: threeObj.visible,
      position: [threeObj.position.x, threeObj.position.y, threeObj.position.z],
      rotation: [threeObj.rotation.x, threeObj.rotation.y, threeObj.rotation.z],
      scale: [threeObj.scale.x, threeObj.scale.y, threeObj.scale.z],
    });
  });
}

/** 判断对象是否为编辑器辅助对象（不应导出） */
export function isEditorHelperObject(obj: THREE.Object3D): boolean {
  if (obj.name === 'grid' || obj.name === 'axes') return true;
  if (obj.name === 'quarks_batched_renderer') return true;
  if (obj.type === 'BatchedRenderer' || obj.type === 'VFXBatch') return true;
  if (obj.name.startsWith('helper_')) return true;
  if (obj.userData?.isEditorHelper) return true;
  if (obj.userData?.isLabelCssObject) return true;
  if (obj.userData?.tourVisual) return true;
  if (obj.type === 'TransformControlsGizmo') return true;

  let parent = obj.parent;
  while (parent) {
    if (parent.type === 'TransformControlsGizmo') return true;
    parent = parent.parent;
  }
  return false;
}

/** 录制/截图前隐藏编辑器辅助对象，返回可见性快照以便恢复 */
export function hideEditorHelpersForCapture(scene: THREE.Scene): Map<THREE.Object3D, boolean> {
  const snapshot = new Map<THREE.Object3D, boolean>();
  scene.traverse((child) => {
    if (isEditorHelperObject(child)) {
      snapshot.set(child, child.visible);
      child.visible = false;
    }
  });
  return snapshot;
}

/** 恢复编辑器辅助对象可见性 */
export function restoreEditorHelpersAfterCapture(snapshot: Map<THREE.Object3D, boolean>) {
  snapshot.forEach((visible, obj) => {
    obj.visible = visible;
  });
}

/** 按全局设置恢复网格与坐标轴可见性（录制失败后兜底） */
export function syncEditorGridAxesVisibility(scene: THREE.Scene) {
  const { gridVisible, axesVisible } = useEditorStore.getState();
  const grid = scene.getObjectByName('grid');
  const axes = scene.getObjectByName('axes');
  if (grid) grid.visible = gridVisible;
  if (axes) axes.visible = axesVisible;
}

/** 创建用于导出的场景副本（仅模型，不含灯光与辅助对象） */
export function createModelsExportScene(source: THREE.Scene): THREE.Scene {
  const exportScene = new THREE.Scene();

  source.children.forEach((child) => {
    if (isEditorHelperObject(child)) return;
    if (child instanceof THREE.Light) return;
    if (child.userData?.isLightTarget) return;
    if (child.userData?.isParticleEmitter) return;
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
    if (child.userData?.isParticleEmitter) return;
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
    if (child instanceof THREE.Points) {
      child.geometry?.dispose();
      const ptsMat = child.material;
      if (Array.isArray(ptsMat)) {
        ptsMat.forEach((material) => material?.dispose());
      } else {
        ptsMat?.dispose();
      }
      return;
    }

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
