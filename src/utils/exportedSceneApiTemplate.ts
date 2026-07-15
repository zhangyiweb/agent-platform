/**
 * 导出包内联到 main.js 的 sceneApi 工厂代码（字符串模板）
 */
export function buildExportedSceneApiScript(hasCameraTour: boolean): string {
  return `
  const objectIdIndex = new Map();
  let cameraTweenRaf = 0;
  let transformTweenRaf = 0;
  const transformRestoreState = new Map();

  function transformRestoreKey(objectId, nodeName) {
    return String(objectId) + '::' + (nodeName || '');
  }

  function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  function rebuildObjectIndex(root) {
    objectIdIndex.clear();
    root.traverse((child) => {
      const cid = child.userData?.id || child.userData?.businessId || child.userData?.editorId;
      if (cid) objectIdIndex.set(cid, child);
    });
  }
  rebuildObjectIndex(scene);

  function resolveObject(id) {
    if (objectIdIndex.has(id)) return objectIdIndex.get(id);
    const found = findObjectById(scene, id);
    if (found) objectIdIndex.set(id, found);
    return found;
  }

  function findNodeByName(root, nodeName) {
    if (!nodeName) return root;
    const name = String(nodeName).trim();
    let found = null;
    root.traverse((child) => {
      if (found) return;
      if (child.name === name) found = child;
    });
    if (found) return found;
    root.traverse((child) => {
      if (found) return;
      if (child.name && child.name.includes(name)) found = child;
    });
    return found || root;
  }

  function resolveVisibilityMode(params) {
    if (params && params.visibilityMode) return params.visibilityMode;
    if (params && params.visible === false) return 'hide';
    if (params && params.visible === true) return 'show';
    return 'toggle';
  }

  function applyVisibilityMode(current, mode) {
    if (mode === 'show') return true;
    if (mode === 'hide') return false;
    return !current;
  }

  function animateCameraTo(endPos, endTarget, durationSec) {
    if (cameraTweenRaf) cancelAnimationFrame(cameraTweenRaf);
    const startPos = camera.position.clone();
    const startTarget = controls.target.clone();
    const durationMs = Math.max(0, Number(durationSec) || 0) * 1000;
    if (durationMs <= 0) {
      camera.position.copy(endPos);
      controls.target.copy(endTarget);
      controls.update();
      return true;
    }
    controls.enabled = false;
    const start = performance.now();
    const tick = (now) => {
      const t = Math.min(1, (now - start) / durationMs);
      const k = easeInOutCubic(t);
      camera.position.lerpVectors(startPos, endPos, k);
      controls.target.lerpVectors(startTarget, endTarget, k);
      controls.update();
      if (t < 1) cameraTweenRaf = requestAnimationFrame(tick);
      else {
        cameraTweenRaf = 0;
        controls.enabled = true;
      }
    };
    cameraTweenRaf = requestAnimationFrame(tick);
    return true;
  }

  async function loadTourById(tourId) {
    ${
      hasCameraTour
        ? `if (!window.cameraTour) return false;
    if (!tourId) {
      window.cameraTour.play();
      return true;
    }
    try {
      const index = await fetch('./config/camera-tour-index.json').then((r) => r.json()).catch(() => null);
      const entry = index?.tours?.find((t) => t.id === tourId);
      const url = entry?.file ? './' + entry.file : './config/camera-tour.json';
      await window.cameraTour.loadConfig(url);
      window.cameraTour.play();
      return true;
    } catch (err) {
      console.warn('[sceneApi] 加载漫游失败', err);
      window.cameraTour.play();
      return true;
    }`
        : `console.warn('[sceneApi] 导出包未包含漫游');
    return false;`
    }
  }

  window.sceneApi = {
    setVisible(objectId, mode) {
      const obj = resolveObject(objectId);
      if (!obj) {
        console.warn('[sceneApi] 未找到对象', objectId);
        return false;
      }
      const visMode = mode === true ? 'show' : mode === false ? 'hide' : (mode || 'toggle');
      obj.visible = applyVisibilityMode(obj.visible, visMode);
      return true;
    },
    select(objectId) {
      const obj = resolveObject(objectId);
      if (!obj) return false;
      obj.traverse((child) => {
        if (!child.isMesh || !child.material) return;
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        mats.forEach((mat) => {
          if (mat.emissive) {
            mat.userData.__prevEmissive = mat.emissive.getHex();
            mat.emissive.setHex(0x3366aa);
            mat.emissiveIntensity = Math.max(mat.emissiveIntensity || 0, 0.35);
          }
        });
      });
      return true;
    },
    focus(objectId, options = {}) {
      const obj = resolveObject(objectId);
      if (!obj) return false;
      let endPos;
      let endTarget;
      if (options.position && options.target) {
        endPos = new THREE.Vector3(options.position.x, options.position.y, options.position.z);
        endTarget = new THREE.Vector3(options.target.x, options.target.y, options.target.z);
      } else {
        const box = new THREE.Box3().setFromObject(obj);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const radius = Math.max(size.x, size.y, size.z, 1) * 0.6;
        const dist = Math.max(8, radius * (options.distance ?? 2.5));
        const dir = new THREE.Vector3().subVectors(camera.position, controls.target).normalize();
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
    setCamera(position, target, duration) {
      const endPos = position
        ? new THREE.Vector3(position.x, position.y, position.z)
        : camera.position.clone();
      const endTarget = target
        ? new THREE.Vector3(target.x, target.y, target.z)
        : controls.target.clone();
      return animateCameraTo(endPos, endTarget, duration ?? 2);
    },
    setMaterial(objectId, params = {}) {
      const root = resolveObject(objectId);
      if (!root) return false;
      const node = findNodeByName(root, params.nodeName);
      let changed = false;
      node.traverse((child) => {
        if (!child.isMesh || !child.material) return;
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        mats.forEach((mat) => {
          if (!mat) return;
          changed = true;
          if (params.color && mat.color) mat.color.set(params.color);
          if (params.emissive && mat.emissive) mat.emissive.set(params.emissive);
          if (params.emissiveIntensity != null && 'emissiveIntensity' in mat) {
            mat.emissiveIntensity = params.emissiveIntensity;
          }
          if (params.metalness != null && 'metalness' in mat) mat.metalness = params.metalness;
          if (params.roughness != null && 'roughness' in mat) mat.roughness = params.roughness;
          if (params.opacity != null) {
            mat.opacity = params.opacity;
            mat.transparent = params.opacity < 1;
          }
          mat.needsUpdate = true;
        });
      });
      return changed;
    },
    setTransform(objectId, params = {}) {
      const root = resolveObject(objectId);
      if (!root) return false;
      const node = findNodeByName(root, params.nodeName);
      const duration = params.duration == null ? 1 : params.duration;
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
        if (state && state.applied) {
          endPos = state.position.clone();
          endRot = new THREE.Euler().setFromQuaternion(state.quaternion);
          endScale = state.scale.clone();
          applyPosition = true;
          applyRotation = true;
          applyScale = true;
          state.applied = false;
        } else if (!state) {
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
      const tick = (now) => {
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
    setUIVisible(elementId, mode) {
      const el =
        document.querySelector('[data-ui-id="' + elementId + '"]') ||
        document.getElementById(elementId);
      if (!el) {
        console.warn('[sceneApi] 未找到 UI 元素', elementId);
        return false;
      }
      const visMode = mode === true ? 'show' : mode === false ? 'hide' : (mode || 'toggle');
      const current = el.style.display !== 'none' && el.style.visibility !== 'hidden';
      const next = applyVisibilityMode(current, visMode);
      el.style.display = next ? '' : 'none';
      el.style.visibility = next ? '' : 'hidden';
      return true;
    },
    async playTour(tourId) {
      return loadTourById(tourId);
    },
    pauseTour() {
      ${hasCameraTour ? 'window.cameraTour?.pause?.(); return Boolean(window.cameraTour);' : 'return false;'}
    },
    stopTour() {
      ${hasCameraTour ? 'window.cameraTour?.stop?.(); return Boolean(window.cameraTour);' : 'return false;'}
    },
    dispatch(action) {
      if (!action || !action.type) return false;
      switch (action.type) {
        case 'object.setVisible':
          return this.setVisible(action.targetId, resolveVisibilityMode(action.params));
        case 'object.select':
          return this.select(action.targetId);
        case 'object.focus':
          return this.focus(action.targetId, {
            distance: action.params?.distance,
            duration: action.params?.duration,
            position: action.params?.position,
            target: action.params?.target,
          });
        case 'object.setMaterial':
          return this.setMaterial(action.targetId, action.params || {});
        case 'object.setTransform':
          return this.setTransform(action.targetId, action.params || {});
        case 'camera.set':
          return this.setCamera(action.params?.position, action.params?.target, action.params?.duration);
        case 'ui.setVisible': {
          const ids = []
            .concat(action.targetIds || [])
            .concat(action.targetId ? [action.targetId] : []);
          const unique = Array.from(new Set(ids.filter(Boolean)));
          if (!unique.length) return false;
          let ok = false;
          unique.forEach((id) => {
            if (this.setUIVisible(id, resolveVisibilityMode(action.params))) ok = true;
          });
          return ok;
        }
        case 'tour.play':
          return this.playTour(action.targetId);
        case 'tour.pause':
          return this.pauseTour();
        case 'tour.stop':
          return this.stopTour();
        case 'custom': {
          const fnName = action.params?.fn || action.targetId;
          const fn = fnName ? window[fnName] : null;
          if (typeof fn === 'function') {
            fn();
            return true;
          }
          console.warn('[sceneApi] 未找到自定义函数', fnName);
          return false;
        }
        default:
          return false;
      }
    },
    onPointPatch(patch) {
      window.dispatchEvent(new CustomEvent('dt-point-patch', { detail: patch }));
    },
  };

  window.dispatchEvent(new CustomEvent('dt-scene-ready'));
  console.info('[sceneApi] 已就绪，可用 window.sceneApi 控制场景');
`;
}
