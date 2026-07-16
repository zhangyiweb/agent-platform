/** 导出项目包中的 labelRuntime.js（CSS2D / CSS3D / CSS3DSprite） */
export function buildLabelRuntimeJs(): string {
  return `import * as THREE from 'three';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { CSS3DRenderer, CSS3DObject, CSS3DSprite } from 'three/addons/renderers/CSS3DRenderer.js';

const LABEL_CSS3D_BASE_SCALE = 0.01;

function resolveLabelScale(cfg) {
  if (cfg?.scale != null && Number.isFinite(cfg.scale) && cfg.scale > 0) return cfg.scale;
  if (cfg?.htmlScale != null && Number.isFinite(cfg.htmlScale) && cfg.htmlScale > 0) {
    return cfg.htmlScale / LABEL_CSS3D_BASE_SCALE;
  }
  return 1;
}

function applyOverlayStyle(el) {
  el.style.position = 'absolute';
  el.style.inset = '0';
  el.style.pointerEvents = 'none';
  el.style.overflow = 'hidden';
  el.style.zIndex = '5';
}

function applyTextStyle(el, cfg) {
  el.style.fontSize = (cfg.fontSize ?? 14) + 'px';
  el.style.color = cfg.color || '#ffffff';
  el.style.background = cfg.backgroundColor || 'rgba(0,0,0,0.65)';
  el.style.padding = (cfg.padding ?? 6) + 'px';
  el.style.borderRadius = (cfg.borderRadius ?? 4) + 'px';
  el.style.border =
    (cfg.borderWidth ?? 0) > 0
      ? (cfg.borderWidth + 'px solid ' + (cfg.borderColor || '#ffffff'))
      : 'none';
  el.style.fontFamily =
    'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif';
  el.style.lineHeight = '1.35';
  el.style.whiteSpace = 'pre-wrap';
  el.style.wordBreak = 'break-word';
  el.style.boxSizing = 'border-box';
  el.style.maxWidth = '480px';
}

function dispatchActions(actions) {
  const api = window.sceneApi;
  if (!api || !Array.isArray(actions)) return;
  if (typeof api.dispatchBatch === 'function') {
    api.dispatchBatch(actions);
    return;
  }
  if (typeof api.dispatch === 'function') {
    actions.forEach((a) => api.dispatch(a));
  }
}

function bindPageInteractions(root, bindings) {
  if (!Array.isArray(bindings) || bindings.length === 0) return;
  bindings.forEach((entry) => {
    const el = root.querySelector('#' + CSS.escape(entry.domId));
    if (!el) return;
    el.classList.add('ui-interactive');
    el.style.pointerEvents = 'auto';
    el.style.cursor = 'pointer';

    const byTrigger = new Map();
    (entry.actions || []).forEach((action) => {
      const trigger = action.trigger || 'click';
      const list = byTrigger.get(trigger) || [];
      list.push(action);
      byTrigger.set(trigger, list);
    });

    byTrigger.forEach((actions, trigger) => {
      const handler = (ev) => {
        if (trigger === 'click' || trigger === 'dblclick') ev.preventDefault();
        ev.stopPropagation();
        dispatchActions(actions);
      };
      el.addEventListener(trigger, handler);
    });
  });
}

function buildUiPageContent(cfg, pack, objectScale) {
  // CSS2D 用物体缩放控制画布视觉大小；CSS3D 用锚点 Group 缩放，画布始终完整设计尺寸
  const visualScale =
    cfg.mode === 'css2d' && objectScale
      ? Math.max(0.01, objectScale.x || 1)
      : 1;
  const designW = Math.max(1, pack.canvasWidth || 1920);
  const designH = Math.max(1, pack.canvasHeight || 1080);
  const outW = Math.max(1, designW * visualScale);
  const outH = Math.max(1, designH * visualScale);

  const root = document.createElement('div');
  root.className = 'scene-label-ui-root';
  root.style.cssText = [
    'width:' + outW + 'px',
    'height:' + outH + 'px',
    'overflow:hidden',
    'position:relative',
    'pointer-events:none',
    'box-sizing:border-box',
  ].join(';');

  const style = document.createElement('style');
  style.textContent = [
    '.scene-label-ui-root { pointer-events: none; font-family: "Microsoft YaHei", "PingFang SC", system-ui, sans-serif; }',
    '.scene-label-ui-canvas { position: absolute; left: 0; top: 0; transform-origin: 0 0; }',
    '.scene-label-ui-canvas .ui-el { box-sizing: border-box; }',
    '.scene-label-ui-canvas .ui-interactive, .scene-label-ui-canvas .ui-interactive * { pointer-events: auto !important; }',
    pack.elementCss || '',
    pack.hoverCss || '',
  ].join('\\n');

  const canvas = document.createElement('div');
  canvas.className = 'scene-label-ui-canvas';
  canvas.style.width = designW + 'px';
  canvas.style.height = designH + 'px';
  canvas.style.background = pack.canvasBackground || 'transparent';
  if (visualScale !== 1) canvas.style.transform = 'scale(' + visualScale + ')';
  canvas.innerHTML = pack.bodyHtml || '';

  root.appendChild(style);
  root.appendChild(canvas);
  bindPageInteractions(canvas, pack.bindings || []);
  return root;
}

function applyContentScale(el, cfg, objectScale) {
  if (cfg.mode !== 'css2d' || cfg.contentMode === 'uiPage') return;
  const sx = objectScale?.x ?? resolveLabelScale(cfg);
  const sy = objectScale?.y ?? resolveLabelScale(cfg);
  if (sx === 1 && sy === 1) {
    el.style.transform = '';
  } else {
    el.style.transform = 'scale(' + sx + ', ' + sy + ')';
  }
  el.style.transformOrigin = 'center bottom';
}

function buildLabelDom(obj, labelPages) {
  const cfg = obj.label || {};
  const objectScale = {
    x: Array.isArray(obj.scale) ? obj.scale[0] : 1,
    y: Array.isArray(obj.scale) ? obj.scale[1] : 1,
    z: Array.isArray(obj.scale) ? obj.scale[2] : 1,
  };

  const wrap = document.createElement('div');
  wrap.className = 'scene-label-dom';
  wrap.style.pointerEvents = 'none';

  if (cfg.contentMode === 'uiPage' && cfg.uiPageId) {
    const pack = labelPages?.[cfg.uiPageId];
    if (pack) {
      wrap.appendChild(buildUiPageContent(cfg, pack, objectScale));
      return wrap;
    }
    wrap.textContent = '未找到 UI 页面';
    applyTextStyle(wrap, { ...cfg, backgroundColor: 'rgba(180,40,40,0.85)' });
    return wrap;
  }

  wrap.textContent = cfg.text || '';
  applyTextStyle(wrap, cfg);
  applyContentScale(wrap, cfg, objectScale);
  return wrap;
}

function createCssObject(mode, dom) {
  if (mode === 'css3d') return new CSS3DObject(dom);
  if (mode === 'css3dSprite') return new CSS3DSprite(dom);
  return new CSS2DObject(dom);
}

function applyCssObjectWorldScale(cssObj, mode) {
  if (mode === 'css2d') {
    cssObj.scale.set(1, 1, 1);
    return;
  }
  cssObj.scale.setScalar(LABEL_CSS3D_BASE_SCALE);
}

/**
 * @param {THREE.Scene} scene
 * @param {THREE.Camera} camera
 * @param {HTMLElement} container
 * @param {Array} objects editor.objects
 * @param {Record<string, object>} labelPages editor.labelPages
 */
export function createLabelSystems(scene, camera, container, objects, labelPages) {
  const labels = (objects || []).filter((o) => o.type === 'label');
  if (labels.length === 0) {
    return { hasLabels: false, render() {}, setSize() {}, dispose() {} };
  }

  const css2d = new CSS2DRenderer();
  const css3d = new CSS3DRenderer();
  applyOverlayStyle(css2d.domElement);
  applyOverlayStyle(css3d.domElement);
  css2d.domElement.className = 'label-css2d-layer';
  css3d.domElement.className = 'label-css3d-layer';
  // 标签层必须低于 #ui-overlay(z-index:10)，避免挡住大屏交互
  css3d.domElement.style.zIndex = '4';
  css2d.domElement.style.zIndex = '5';
  container.appendChild(css3d.domElement);
  container.appendChild(css2d.domElement);

  const width = window.innerWidth;
  const height = window.innerHeight;
  css2d.setSize(width, height);
  css3d.setSize(width, height);

  const anchors = [];
  labels.forEach((obj) => {
    const cfg = obj.label || {};
    const mode = cfg.mode || 'css2d';
    const dom = buildLabelDom(obj, labelPages || {});
    const cssObj = createCssObject(mode, dom);
    applyCssObjectWorldScale(cssObj, mode);

    const anchor = new THREE.Group();
    anchor.name = obj.name || obj.id;
    anchor.userData.id = obj.id;
    anchor.userData.type = 'label';
    anchor.userData.labelConfig = cfg;
    if (obj.position) anchor.position.set(obj.position[0], obj.position[1], obj.position[2]);
    if (obj.rotation) anchor.rotation.set(obj.rotation[0], obj.rotation[1], obj.rotation[2]);
    if (obj.scale) anchor.scale.set(obj.scale[0], obj.scale[1], obj.scale[2]);
    anchor.visible = obj.visible !== false;
    anchor.add(cssObj);
    scene.add(anchor);
    anchors.push(anchor);
  });

  return {
    hasLabels: true,
    anchors,
    css2d,
    css3d,
    render(sc, cam) {
      css3d.render(sc, cam);
      css2d.render(sc, cam);
    },
    setSize(w, h) {
      css2d.setSize(w, h);
      css3d.setSize(w, h);
    },
    dispose() {
      anchors.forEach((a) => {
        scene.remove(a);
        a.traverse((child) => {
          if (child.element?.parentNode) child.element.parentNode.removeChild(child.element);
        });
      });
      css2d.domElement.remove();
      css3d.domElement.remove();
    },
  };
}
`;
}
