import * as THREE from 'three';
import { useSceneStore } from '@/store/sceneStore';
import { useTourStore } from '@/store/tourStore';
import { useUIEditorStore } from '@/store/uiEditorStore';
import { useEditorStore } from '@/store/editorStore';
import { CameraTourPlayer } from '@/utils/cameraTourPlayer';
import { bindEditorTourPlayer } from '@/components/Panels/CameraTourPanel';
import { getElementDomId } from '@/utils/uiElementDom';
import {
  applyVisibilityMode,
  DEFAULT_TRANSFORM_DURATION,
  resolveActionTargetIds,
  resolveVisibilityMode,
  type UIAction,
  type Vec3Param,
  type VisibilityMode,
} from '@/types/uiInteraction';

/** 联动预览中的 UI 显隐（不写回编辑器 store） */
const previewUIVisibility = new Map<string, boolean>();

/** 联动预览中改过显隐的场景对象（退出时按编辑器 store 还原） */
const previewObjectVisibility = new Set<string>();

/** 清除联动预览运行时态：还原 3D 对象显隐，并丢掉预览期 UI 显隐覆盖 */
export function clearPreviewUIVisibility() {
  previewUIVisibility.clear();
  if (previewObjectVisibility.size > 0) {
    const { objects, getThreeObject } = useSceneStore.getState();
    const visibleById = new Map(objects.map((obj) => [obj.id, obj.visible !== false]));
    previewObjectVisibility.forEach((id) => {
      const three = getThreeObject(id);
      if (!three) return;
      three.visible = visibleById.get(id) ?? true;
    });
    previewObjectVisibility.clear();
  }
}

declare global {
  interface Window {
    __editorScene?: THREE.Scene;
    __editorCamera?: THREE.PerspectiveCamera;
    __editorControls?: {
      target: THREE.Vector3;
      update: () => void;
      enabled: boolean;
    };
    __editorTourPlayer?: CameraTourPlayer | null;
    __editorTransformControls?: {
      attach: (object: THREE.Object3D) => void;
      detach: () => void;
    } | null;
    sceneApi?: EditorSceneApi;
  }
}

export interface EditorSceneApi {
  setVisible: (objectId: string, mode?: VisibilityMode | boolean) => boolean;
  select: (objectId: string) => boolean;
  focus: (
    objectId: string,
    options?: {
      distance?: number;
      duration?: number;
      position?: Vec3Param;
      target?: Vec3Param;
    }
  ) => boolean;
  setCamera: (
    position?: Vec3Param,
    target?: Vec3Param,
    duration?: number
  ) => boolean;
  setMaterial: (
    objectId: string,
    params: {
      nodeName?: string;
      color?: string;
      metalness?: number;
      roughness?: number;
      opacity?: number;
      emissive?: string;
      emissiveIntensity?: number;
    }
  ) => boolean;
  setTransform: (
    objectId: string,
    params: {
      nodeName?: string;
      position?: Vec3Param;
      rotation?: Vec3Param;
      scale?: Vec3Param;
      duration?: number;
      /** 再次触发时还原原始变换 */
      restoreToggle?: boolean;
    }
  ) => boolean;
  setUIVisible: (elementId: string | string[], mode?: VisibilityMode | boolean) => boolean;
  playTour: (tourId?: string) => boolean;
  pauseTour: () => boolean;
  stopTour: () => boolean;
  dispatch: (action: UIAction) => boolean;
}

let cameraTweenRaf = 0;
let transformTweenRaf = 0;

/** 节点变换「再次点击还原」运行时状态 */
const transformRestoreState = new Map<
  string,
  {
    applied: boolean;
    position: THREE.Vector3;
    quaternion: THREE.Quaternion;
    scale: THREE.Vector3;
  }
>();

function transformRestoreKey(objectId: string, nodeName?: string) {
  return `${objectId}::${nodeName || ''}`;
}

function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

function stopCameraTween() {
  if (cameraTweenRaf) {
    cancelAnimationFrame(cameraTweenRaf);
    cameraTweenRaf = 0;
  }
}

function animateCameraTo(
  endPos: THREE.Vector3,
  endTarget: THREE.Vector3,
  durationSec: number
) {
  const camera = window.__editorCamera;
  const controls = window.__editorControls;
  if (!camera || !controls) return false;

  stopCameraTween();
  const startPos = camera.position.clone();
  const startTarget = controls.target.clone();
  const durationMs = Math.max(0, durationSec) * 1000;

  if (durationMs <= 0) {
    camera.position.copy(endPos);
    controls.target.copy(endTarget);
    controls.update();
    useSceneStore.getState().updateCamera({
      position: [endPos.x, endPos.y, endPos.z],
      target: [endTarget.x, endTarget.y, endTarget.z],
    });
    return true;
  }

  controls.enabled = false;
  const start = performance.now();

  const tick = (now: number) => {
    const t = Math.min(1, (now - start) / durationMs);
    const k = easeInOutCubic(t);
    camera.position.lerpVectors(startPos, endPos, k);
    controls.target.lerpVectors(startTarget, endTarget, k);
    controls.update();
    if (t < 1) {
      cameraTweenRaf = requestAnimationFrame(tick);
    } else {
      cameraTweenRaf = 0;
      controls.enabled = true;
      useSceneStore.getState().updateCamera({
        position: [endPos.x, endPos.y, endPos.z],
        target: [endTarget.x, endTarget.y, endTarget.z],
      });
    }
  };

  cameraTweenRaf = requestAnimationFrame(tick);
  return true;
}

export function getObject(objectId: string): THREE.Object3D | undefined {
  const fromStore = useSceneStore.getState().getThreeObject(objectId);
  if (fromStore) return fromStore;
  const scene = window.__editorScene;
  if (!scene) return undefined;
  let found: THREE.Object3D | undefined;
  scene.traverse((child) => {
    if (found) return;
    const id = child.userData?.id || child.userData?.businessId || child.userData?.editorId;
    if (id === objectId) found = child;
  });
  return found;
}

/** 在对象树中按名称查找节点（优先精确匹配） */
export function findNodeByName(root: THREE.Object3D, nodeName?: string): THREE.Object3D {
  if (!nodeName?.trim()) return root;
  const name = nodeName.trim();
  let found: THREE.Object3D | undefined;
  root.traverse((child) => {
    if (found) return;
    if (child.name === name) found = child;
  });
  if (found) return found;
  root.traverse((child) => {
    if (found) return;
    if (child.name && child.name.includes(name)) found = child;
  });
  return found ?? root;
}

/** 列出对象下可用子节点名（供属性面板选择） */
export function listChildNodeNames(objectId: string, limit = 80): string[] {
  const root = getObject(objectId);
  if (!root) return [];
  const names: string[] = [];
  const seen = new Set<string>();
  root.traverse((child) => {
    if (child === root) return;
    if (!child.name || seen.has(child.name)) return;
    seen.add(child.name);
    names.push(child.name);
  });
  return names.slice(0, limit);
}

/** 读取对象/子节点当前变换，供交互面板默认同步 */
export function readNodeTransform(
  objectId: string,
  nodeName?: string
): {
  position: Vec3Param;
  rotation: Vec3Param;
  scale: Vec3Param;
} | null {
  const root = getObject(objectId);
  if (!root) return null;
  const node = findNodeByName(root, nodeName);
  return {
    position: {
      x: Number(node.position.x.toFixed(4)),
      y: Number(node.position.y.toFixed(4)),
      z: Number(node.position.z.toFixed(4)),
    },
    rotation: {
      x: Number(THREE.MathUtils.radToDeg(node.rotation.x).toFixed(2)),
      y: Number(THREE.MathUtils.radToDeg(node.rotation.y).toFixed(2)),
      z: Number(THREE.MathUtils.radToDeg(node.rotation.z).toFixed(2)),
    },
    scale: {
      x: Number(node.scale.x.toFixed(4)),
      y: Number(node.scale.y.toFixed(4)),
      z: Number(node.scale.z.toFixed(4)),
    },
  };
}

function clearSelectionHighlight() {
  const scene = window.__editorScene;
  if (!scene) return;
  scene.traverse((child) => {
    if (!(child as THREE.Mesh).isMesh) return;
    const mesh = child as THREE.Mesh;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    materials.forEach((mat) => {
      if (!mat?.userData?.__selectEmissiveBackup) return;
      const backup = mat.userData.__selectEmissiveBackup as {
        color: number;
        intensity: number;
      };
      if ('emissive' in mat && mat.emissive) {
        (mat as THREE.MeshStandardMaterial).emissive.setHex(backup.color);
        (mat as THREE.MeshStandardMaterial).emissiveIntensity = backup.intensity;
      }
      delete mat.userData.__selectEmissiveBackup;
    });
  });
}

function applySelectionHighlight(object: THREE.Object3D) {
  clearSelectionHighlight();
  object.traverse((child) => {
    if (!(child as THREE.Mesh).isMesh) return;
    const mesh = child as THREE.Mesh;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    materials.forEach((mat) => {
      if (!mat || !('emissive' in mat) || !(mat as THREE.MeshStandardMaterial).emissive) return;
      const m = mat as THREE.MeshStandardMaterial;
      if (!m.userData.__selectEmissiveBackup) {
        m.userData.__selectEmissiveBackup = {
          color: m.emissive.getHex(),
          intensity: m.emissiveIntensity ?? 0,
        };
      }
      m.emissive.setHex(0x3b82f6);
      m.emissiveIntensity = Math.max(m.emissiveIntensity || 0, 0.55);
      m.needsUpdate = true;
    });
  });
}

function normalizeVisibilityArg(mode?: VisibilityMode | boolean): VisibilityMode {
  if (mode === true) return 'show';
  if (mode === false) return 'hide';
  if (mode === 'show' || mode === 'hide' || mode === 'toggle') return mode;
  return 'toggle';
}

function ensureTourPlayer(tourId?: string): CameraTourPlayer | null {
  const camera = window.__editorCamera;
  const controls = window.__editorControls;
  if (!camera || !controls) return null;

  const { tours, activeTourId, setActiveTourId, setPreviewPlaying } = useTourStore.getState();
  const id = tourId || activeTourId || tours[0]?.id;
  if (!id) return null;
  const tour = tours.find((t) => t.id === id);
  if (!tour || tour.stops.length === 0) return null;

  if (tourId && tourId !== activeTourId) {
    setActiveTourId(tourId);
  }

  let player = window.__editorTourPlayer ?? null;
  if (!player) {
    player = new CameraTourPlayer(camera, controls, tour, {
      onComplete: () => setPreviewPlaying(false),
      onStateChange: (state) => {
        setPreviewPlaying(state === 'playing' || state === 'dwelling' || state === 'paused');
      },
    });
    bindEditorTourPlayer(player);
  } else {
    player.setTour(tour);
  }
  return player;
}

function createEditorSceneApi(): EditorSceneApi {
  const api: EditorSceneApi = {
    setVisible(objectId, mode = 'toggle') {
      const object = getObject(objectId);
      if (!object) {
        console.warn('[sceneApi] 未找到对象', objectId);
        return false;
      }
      const next = applyVisibilityMode(object.visible, normalizeVisibilityArg(mode));
      object.visible = next;
      const isPreview = useEditorStore.getState().editorMode === 'preview';
      if (isPreview) {
        // 预览只改 Three 运行时显隐，不写回编辑器，避免切回场景编辑后模型仍被隐藏
        previewObjectVisibility.add(objectId);
      } else {
        useSceneStore.getState().updateObject(objectId, { visible: next });
      }
      return true;
    },

    select(objectId) {
      const object = getObject(objectId);
      if (!object) return false;
      useSceneStore.getState().selectObject(objectId);
      applySelectionHighlight(object);
      const tc = window.__editorTransformControls;
      if (tc) {
        try {
          tc.attach(object);
        } catch {
          /* ignore */
        }
      }
      return true;
    },

    focus(objectId, options = {}) {
      const object = getObject(objectId);
      const camera = window.__editorCamera;
      const controls = window.__editorControls;
      if (!object || !camera || !controls) return false;

      let endPos: THREE.Vector3;
      let endTarget: THREE.Vector3;

      if (options.position && options.target) {
        endPos = new THREE.Vector3(options.position.x, options.position.y, options.position.z);
        endTarget = new THREE.Vector3(options.target.x, options.target.y, options.target.z);
      } else {
        const box = new THREE.Box3().setFromObject(object);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const radius = Math.max(size.x, size.y, size.z, 1) * 0.6;
        const dist = Math.max(8, radius * (options.distance ?? 2.5));
        const dir = new THREE.Vector3()
          .subVectors(camera.position, controls.target)
          .normalize();
        if (dir.lengthSq() < 0.001) dir.set(1, 0.8, 1).normalize();

        endTarget = options.target
          ? new THREE.Vector3(options.target.x, options.target.y, options.target.z)
          : center;
        endPos = options.position
          ? new THREE.Vector3(options.position.x, options.position.y, options.position.z)
          : endTarget.clone().addScaledVector(dir, dist);
      }

      return animateCameraTo(endPos, endTarget, options.duration ?? 2);
    },

    setCamera(position, target, duration = 2) {
      const camera = window.__editorCamera;
      const controls = window.__editorControls;
      if (!camera || !controls) return false;
      const endPos = position
        ? new THREE.Vector3(position.x, position.y, position.z)
        : camera.position.clone();
      const endTarget = target
        ? new THREE.Vector3(target.x, target.y, target.z)
        : controls.target.clone();
      return animateCameraTo(endPos, endTarget, duration ?? 2);
    },

    setMaterial(objectId, params) {
      const root = getObject(objectId);
      if (!root) return false;
      const node = findNodeByName(root, params.nodeName);
      let changed = false;
      node.traverse((child) => {
        if (!(child as THREE.Mesh).isMesh) return;
        const mesh = child as THREE.Mesh;
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        materials.forEach((mat) => {
          if (!mat) return;
          changed = true;
          const m = mat as THREE.MeshStandardMaterial;
          if (params.color && 'color' in m && m.color) m.color.set(params.color);
          if (params.emissive && 'emissive' in m && m.emissive) m.emissive.set(params.emissive);
          if (params.emissiveIntensity !== undefined && 'emissiveIntensity' in m) {
            m.emissiveIntensity = params.emissiveIntensity;
          }
          if (params.metalness !== undefined && 'metalness' in m) m.metalness = params.metalness;
          if (params.roughness !== undefined && 'roughness' in m) m.roughness = params.roughness;
          if (params.opacity !== undefined) {
            m.opacity = params.opacity;
            m.transparent = params.opacity < 1;
          }
          m.needsUpdate = true;
        });
      });
      return changed;
    },

    setTransform(objectId, params) {
      const root = getObject(objectId);
      if (!root) return false;
      const node = findNodeByName(root, params.nodeName);
      const duration = params.duration ?? DEFAULT_TRANSFORM_DURATION;
      const restoreToggle = Boolean(params.restoreToggle);
      const stateKey = transformRestoreKey(objectId, params.nodeName);

      let applyPosition = Boolean(params.position);
      let applyRotation = Boolean(params.rotation);
      let applyScale = Boolean(params.scale);
      let endPos = params.position
        ? new THREE.Vector3(params.position.x, params.position.y, params.position.z)
        : node.position.clone();
      let endRot = params.rotation
        ? new THREE.Euler(
            THREE.MathUtils.degToRad(params.rotation.x),
            THREE.MathUtils.degToRad(params.rotation.y),
            THREE.MathUtils.degToRad(params.rotation.z)
          )
        : node.rotation.clone();
      let endScale = params.scale
        ? new THREE.Vector3(params.scale.x, params.scale.y, params.scale.z)
        : node.scale.clone();

      if (restoreToggle) {
        const state = transformRestoreState.get(stateKey);
        if (state?.applied) {
          // 再次点击：还原到首次执行前的原始变换
          endPos = state.position.clone();
          endRot = new THREE.Euler().setFromQuaternion(state.quaternion);
          endScale = state.scale.clone();
          applyPosition = true;
          applyRotation = true;
          applyScale = true;
          state.applied = false;
        } else {
          if (!state) {
            transformRestoreState.set(stateKey, {
              applied: true,
              position: node.position.clone(),
              quaternion: node.quaternion.clone(),
              scale: node.scale.clone(),
            });
          } else {
            state.applied = true;
          }
        }
      }

      if (duration <= 0) {
        if (applyPosition) node.position.copy(endPos);
        if (applyRotation) node.rotation.copy(endRot);
        if (applyScale) node.scale.copy(endScale);
        return true;
      }

      if (transformTweenRaf) cancelAnimationFrame(transformTweenRaf);
      const startPos = node.position.clone();
      const startQuat = node.quaternion.clone();
      const endQuat = new THREE.Quaternion().setFromEuler(endRot);
      const startScale = node.scale.clone();
      const start = performance.now();
      const durationMs = duration * 1000;

      const tick = (now: number) => {
        const t = Math.min(1, (now - start) / durationMs);
        const k = easeInOutCubic(t);
        if (applyPosition) node.position.lerpVectors(startPos, endPos, k);
        if (applyRotation) node.quaternion.slerpQuaternions(startQuat, endQuat, k);
        if (applyScale) node.scale.lerpVectors(startScale, endScale, k);
        if (t < 1) transformTweenRaf = requestAnimationFrame(tick);
        else transformTweenRaf = 0;
      };
      transformTweenRaf = requestAnimationFrame(tick);
      return true;
    },

    setUIVisible(elementId, mode = 'toggle') {
      const ids = Array.isArray(elementId) ? elementId : [elementId];
      const store = useUIEditorStore.getState();
      const visMode = normalizeVisibilityArg(mode);
      const isPreview = useEditorStore.getState().editorMode === 'preview';
      let ok = false;

      ids.forEach((id) => {
        const el = store.elements.find((e) => e.id === id);
        const dom =
          document.querySelector(`[data-ui-id="${CSS.escape(id)}"]`) ||
          (el ? document.getElementById(getElementDomId(el)) : null) ||
          document.getElementById(id);

        let currentVisible: boolean;
        if (isPreview) {
          if (previewUIVisibility.has(id)) {
            currentVisible = previewUIVisibility.get(id)!;
          } else if (dom instanceof HTMLElement) {
            currentVisible =
              dom.style.display !== 'none' && dom.style.visibility !== 'hidden';
          } else {
            currentVisible = el?.visible !== false;
          }
        } else {
          currentVisible = el?.visible !== false;
        }

        const next = applyVisibilityMode(currentVisible, visMode);

        if (isPreview) {
          // 预览只改 DOM，不写回编辑器，避免切回编排后面板被永久隐藏
          previewUIVisibility.set(id, next);
        } else if (el) {
          store.updateElement(id, { visible: next });
        } else {
          console.warn('[sceneApi] 未找到 UI 元素', id);
          return;
        }

        if (dom instanceof HTMLElement) {
          dom.style.display = next ? '' : 'none';
          dom.style.visibility = next ? '' : 'hidden';
        }
        ok = true;
      });

      return ok;
    },

    playTour(tourId) {
      const player = ensureTourPlayer(tourId);
      if (!player) {
        console.warn('[sceneApi] 无可用漫游路线');
        return false;
      }
      player.play();
      useTourStore.getState().setPreviewPlaying(true);
      return true;
    },

    pauseTour() {
      const player = window.__editorTourPlayer;
      if (!player) return false;
      player.pause();
      return true;
    },

    stopTour() {
      const player = window.__editorTourPlayer;
      if (!player) return false;
      player.stop();
      useTourStore.getState().setPreviewPlaying(false);
      return true;
    },

    dispatch(action) {
      return dispatchUIAction(action);
    },
  };

  return api;
}

/** 执行单条 UI 动作 */
export function dispatchUIAction(action: UIAction): boolean {
  const api = window.sceneApi ?? ensureEditorSceneApi();
  switch (action.type) {
    case 'object.setVisible': {
      const ids = resolveActionTargetIds(action);
      if (ids.length === 0) return false;
      let ok = false;
      for (const id of ids) {
        if (api.setVisible(id, resolveVisibilityMode(action.params))) ok = true;
      }
      return ok;
    }    case 'object.select':
      if (!action.targetId) return false;
      return api.select(action.targetId);
    case 'object.focus':
      if (!action.targetId) return false;
      return api.focus(action.targetId, {
        distance: action.params?.distance,
        duration: action.params?.duration,
        position: action.params?.position,
        target: action.params?.target,
      });
    case 'object.setMaterial':
      if (!action.targetId) return false;
      return api.setMaterial(action.targetId, {
        nodeName: action.params?.nodeName,
        color: action.params?.color,
        metalness: action.params?.metalness,
        roughness: action.params?.roughness,
        opacity: action.params?.opacity,
        emissive: action.params?.emissive,
        emissiveIntensity: action.params?.emissiveIntensity,
      });
    case 'object.setTransform':
      if (!action.targetId) return false;
      return api.setTransform(action.targetId, {
        nodeName: action.params?.nodeName,
        position: action.params?.position,
        rotation: action.params?.rotation,
        scale: action.params?.scale,
        duration: action.params?.duration,
        restoreToggle: action.params?.restoreToggle,
      });
    case 'camera.set':
      return api.setCamera(
        action.params?.position,
        action.params?.target,
        action.params?.duration
      );
    case 'ui.setVisible': {
      const ids = resolveActionTargetIds(action);
      if (ids.length === 0) return false;
      return api.setUIVisible(ids, resolveVisibilityMode(action.params));
    }
    case 'tour.play':
      return api.playTour(action.targetId);
    case 'tour.pause':
      return api.pauseTour();
    case 'tour.stop':
      return api.stopTour();
    case 'custom': {
      const fnName = action.params?.fn || action.targetId;
      if (!fnName) return false;
      const fn = (window as unknown as Record<string, unknown>)[fnName];
      if (typeof fn === 'function') {
        (fn as () => void)();
        return true;
      }
      console.warn('[sceneApi] 未找到自定义函数', fnName);
      return false;
    }
    default:
      return false;
  }
}

/**
 * 同一触发下按序执行全部动作。
 * UI 显隐放到最后，避免提前隐藏打断同批相机/模型动作。
 */
export function dispatchUIActions(actions: UIAction[]): boolean {
  if (!actions.length) return false;
  const sceneActions = actions.filter((a) => a.type !== 'ui.setVisible');
  const uiActions = actions.filter((a) => a.type === 'ui.setVisible');
  let ok = false;
  sceneActions.forEach((action) => {
    if (dispatchUIAction(action)) ok = true;
  });
  uiActions.forEach((action) => {
    if (dispatchUIAction(action)) ok = true;
  });
  return ok;
}

/** 确保编辑器挂载 sceneApi */
export function ensureEditorSceneApi(): EditorSceneApi {
  if (!window.sceneApi) {
    window.sceneApi = createEditorSceneApi();
  }
  return window.sceneApi;
}
