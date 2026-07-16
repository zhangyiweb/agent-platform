import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { CSS3DObject, CSS3DSprite } from 'three/addons/renderers/CSS3DRenderer.js';
import type { SceneObject } from '@/types/scene';
import type { SceneLabelConfig } from '@/types/sceneLabel';
import {
  createDefaultLabelConfig,
  resolveLabelScale,
  LABEL_CSS3D_BASE_SCALE,
} from '@/types/sceneLabel';
import { buildUIExportBundle } from '@/utils/uiExportCore';
import { useUIEditorStore } from '@/store/uiEditorStore';
import { useSceneStore } from '@/store/sceneStore';
import { collectUIBindings } from '@/utils/uiInteractionExport';
import { dispatchUIActions, ensureEditorSceneApi } from '@/runtime/sceneApi';

export const LABEL_PICK_HELPER_NAME = 'label_pick_helper';

function applyTextStyle(el: HTMLElement, cfg: SceneLabelConfig) {
  el.style.fontSize = `${cfg.fontSize}px`;
  el.style.color = cfg.color;
  el.style.background = cfg.backgroundColor;
  el.style.padding = `${cfg.padding}px`;
  el.style.borderRadius = `${cfg.borderRadius}px`;
  el.style.border =
    cfg.borderWidth > 0 ? `${cfg.borderWidth}px solid ${cfg.borderColor}` : 'none';
  el.style.fontFamily =
    'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif';
  el.style.lineHeight = '1.35';
  el.style.whiteSpace = 'pre-wrap';
  el.style.wordBreak = 'break-word';
  el.style.boxSizing = 'border-box';
  el.style.pointerEvents = 'none';
  el.style.userSelect = 'none';
  el.style.maxWidth = '480px';
}

function forceNoPointerEvents(root: HTMLElement) {
  root.style.pointerEvents = 'none';
  root.querySelectorAll('*').forEach((node) => {
    (node as HTMLElement).style.pointerEvents = 'none';
  });
}

const LABEL_UI_CLEANUP_KEY = '__labelUiCleanup';

/** 绑定标签内嵌 UI 页的交互（联动预览中点击触发） */
export function bindLabelUiInteractions(root: HTMLElement, pageId: string) {
  const prev = (root as unknown as Record<string, unknown>)[LABEL_UI_CLEANUP_KEY];
  if (typeof prev === 'function') {
    (prev as () => void)();
  }

  const page = useUIEditorStore.getState().getPagesSnapshot().find((p) => p.id === pageId);
  if (!page) {
    (root as unknown as Record<string, unknown>)[LABEL_UI_CLEANUP_KEY] = undefined;
    return;
  }

  ensureEditorSceneApi();
  const bindings = collectUIBindings(page.elements);
  const cleanups: Array<() => void> = [];

  bindings.forEach((entry) => {
    const el = root.querySelector(`#${CSS.escape(entry.domId)}`) as HTMLElement | null;
    if (!el) return;
    el.classList.add('ui-interactive');

    const byTrigger = new Map<string, typeof entry.actions>();
    (entry.actions || []).forEach((action) => {
      const trigger = action.trigger || 'click';
      const list = byTrigger.get(trigger) ?? [];
      list.push(action);
      byTrigger.set(trigger, list);
    });

    byTrigger.forEach((actions, trigger) => {
      const handler = (ev: Event) => {
        if (trigger === 'click' || trigger === 'dblclick') {
          ev.preventDefault();
        }
        ev.stopPropagation();
        dispatchUIActions(actions);
      };
      el.addEventListener(trigger, handler);
      cleanups.push(() => el.removeEventListener(trigger, handler));
    });
  });

  (root as unknown as Record<string, unknown>)[LABEL_UI_CLEANUP_KEY] = () => {
    cleanups.forEach((fn) => fn());
  };
}

/** 从 UI 编排生成可嵌入标签的完整画布（设计宽高 1:1，不被裁切） */
export function buildLabelUiPageFragment(
  pageId: string,
  visualScale = 1
): { root: HTMLElement; designWidth: number; designHeight: number } | null {
  const page = useUIEditorStore.getState().getPagesSnapshot().find((p) => p.id === pageId);
  if (!page) return null;

  const bundle = buildUIExportBundle(
    page.elements,
    page.canvasWidth,
    page.canvasHeight,
    page.canvasBackground,
    undefined,
    { includeHidden: true }
  );

  const designWidth = Math.max(1, page.canvasWidth);
  const designHeight = Math.max(1, page.canvasHeight);
  const s = Math.max(0.01, visualScale);
  const outW = Math.max(1, designWidth * s);
  const outH = Math.max(1, designHeight * s);

  // 外层按视觉缩放占位，内层保持设计稿完整尺寸再 scale，避免只露出一角
  const root = document.createElement('div');
  root.className = 'scene-label-ui-root';
  root.dataset.uiPageId = pageId;
  root.style.cssText = [
    `width:${outW}px`,
    `height:${outH}px`,
    'overflow:hidden',
    'position:relative',
    'pointer-events:none',
    'box-sizing:border-box',
  ].join(';');

  const style = document.createElement('style');
  // 不注入全局 html/body/.ui-page(100vw) 规则，避免污染编辑器并裁切画布
  style.textContent = `
.scene-label-ui-root {
  pointer-events: none;
}
.scene-label-ui-canvas {
  position: absolute;
  left: 0;
  top: 0;
  width: ${designWidth}px;
  height: ${designHeight}px;
  transform: scale(${s});
  transform-origin: top left;
  overflow: hidden;
  background: ${page.canvasBackground || 'transparent'};
  box-sizing: border-box;
}
.scene-label-ui-canvas .ui-el {
  position: absolute;
  box-sizing: border-box;
}
.scene-label-ui-canvas .ui-el-text {
  display: inline-block;
  max-width: 100%;
  word-break: break-word;
}
/* 仅联动预览开启交互时由 .is-preview-interactive 打开点击 */
.editor-css-overlay.is-preview-interactive .scene-label-ui-root .ui-interactive,
.editor-css-overlay.is-preview-interactive .scene-label-ui-root .ui-interactive * {
  pointer-events: auto !important;
  cursor: pointer;
}
${bundle.elementCss}
${bundle.hoverCss}
`.trim();

  const canvas = document.createElement('div');
  canvas.className = 'scene-label-ui-canvas';
  canvas.innerHTML = bundle.bodyHtml;

  root.appendChild(style);
  root.appendChild(canvas);
  bindLabelUiInteractions(root, pageId);
  return { root, designWidth, designHeight };
}

function applyContentScale(el: HTMLElement, cfg: SceneLabelConfig, objectScale?: THREE.Vector3) {
  if (cfg.mode !== 'css2d' || cfg.contentMode === 'uiPage') return;
  const sx = objectScale?.x ?? resolveLabelScale(cfg);
  const sy = objectScale?.y ?? resolveLabelScale(cfg);
  if (sx === 1 && sy === 1) {
    el.style.transform = '';
  } else {
    el.style.transform = `scale(${sx}, ${sy})`;
  }
  el.style.transformOrigin = 'center bottom';
}

function buildLabelDom(cfg: SceneLabelConfig, objectScale?: THREE.Vector3): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'scene-label-dom';
  wrap.dataset.labelMode = cfg.mode;
  wrap.style.pointerEvents = 'none';

  // CSS2D 用物体缩放控制画布视觉大小；CSS3D 用锚点 Group 缩放，画布始终完整设计尺寸
  const visualScale =
    cfg.mode === 'css2d' && objectScale ? Math.max(0.01, objectScale.x) : 1;

  if (cfg.contentMode === 'uiPage' && cfg.uiPageId) {
    const frag = buildLabelUiPageFragment(cfg.uiPageId, visualScale);
    if (frag) {
      wrap.appendChild(frag.root);
      return wrap;
    }
    wrap.textContent = `未找到 UI 页面`;
    applyTextStyle(wrap, { ...cfg, backgroundColor: 'rgba(127,29,29,0.9)' });
    forceNoPointerEvents(wrap);
    return wrap;
  }

  wrap.textContent = cfg.text || '标签';
  applyTextStyle(wrap, cfg);
  applyContentScale(wrap, cfg, objectScale);
  forceNoPointerEvents(wrap);
  return wrap;
}

function applyCssObjectWorldScale(cssObj: THREE.Object3D, cfg: SceneLabelConfig) {
  if (cfg.mode === 'css2d') {
    cssObj.scale.set(1, 1, 1);
    return;
  }
  // 用户 XYZ 缩放挂在锚点 Group 上；此处只保留像素→世界单位基线
  cssObj.scale.setScalar(LABEL_CSS3D_BASE_SCALE);
}

function createCssObject(mode: SceneLabelConfig['mode'], element: HTMLElement): THREE.Object3D {
  if (mode === 'css2d') return new CSS2DObject(element);
  if (mode === 'css3dSprite') return new CSS3DSprite(element);
  return new CSS3DObject(element);
}

function ensurePickHelper(anchor: THREE.Object3D) {
  let helper = anchor.getObjectByName(LABEL_PICK_HELPER_NAME) as THREE.Mesh | undefined;
  if (helper) {
    // 旧标签可能还是小拾取球，统一放大
    if (helper.geometry instanceof THREE.SphereGeometry) {
      const radius = helper.geometry.parameters?.radius ?? 0;
      if (radius < 0.4) {
        helper.geometry.dispose();
        helper.geometry = new THREE.SphereGeometry(0.45, 12, 12);
      }
    }
    return helper;
  }
  // 稍大一点，方便点选 CSS3D / 大尺寸 UI 标签锚点
  const geo = new THREE.SphereGeometry(0.45, 12, 12);
  const mat = new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  helper = new THREE.Mesh(geo, mat);
  helper.name = LABEL_PICK_HELPER_NAME;
  helper.userData.isEditorHelper = true;
  helper.userData.labelPickHelper = true;
  helper.layers.enable(0);
  anchor.add(helper);
  return helper;
}

function disposePickHelper(anchor: THREE.Object3D) {
  const helper = anchor.getObjectByName(LABEL_PICK_HELPER_NAME);
  if (!helper) return;
  anchor.remove(helper);
  if (helper instanceof THREE.Mesh) {
    helper.geometry.dispose();
    if (Array.isArray(helper.material)) helper.material.forEach((m) => m.dispose());
    else helper.material.dispose();
  }
}

/**
 * 创建标签锚点 Group：挂不可见拾取球 + CSS2D/CSS3D 对象
 */
export function createLabelAnchor(
  id: string,
  name: string,
  cfg?: Partial<SceneLabelConfig>
): THREE.Group {
  const config: SceneLabelConfig = {
    ...createDefaultLabelConfig(cfg?.mode ?? 'css2d'),
    ...cfg,
    scale: resolveLabelScale(cfg),
  };
  const anchor = new THREE.Group();
  anchor.name = name;
  anchor.userData.id = id;
  anchor.userData.type = 'label';
  anchor.userData.labelConfig = config;

  ensurePickHelper(anchor);
  const element = buildLabelDom(config, anchor.scale);
  const cssObj = createCssObject(config.mode, element);
  cssObj.name = 'label_css_object';
  cssObj.userData.isLabelCssObject = true;
  applyCssObjectWorldScale(cssObj, config);
  anchor.add(cssObj);
  return anchor;
}

/** 按最新配置重建标签 DOM / CSS 对象（模式切换时会换对象类型） */
export function syncLabelObject(anchor: THREE.Object3D, cfg: SceneLabelConfig) {
  const group = anchor as THREE.Group;
  group.userData.labelConfig = cfg;
  group.userData.type = 'label';

  // 移除旧 CSS 对象
  const stale: THREE.Object3D[] = [];
  group.children.forEach((child) => {
    if (child.userData?.isLabelCssObject || child.name === 'label_css_object') {
      stale.push(child);
    }
  });
  stale.forEach((child) => {
    group.remove(child);
    const el =
      (child as CSS2DObject).element ||
      (child as CSS3DObject).element ||
      null;
    if (el) {
      const root = el.querySelector?.('.scene-label-ui-root') || el;
      const prev = (root as unknown as Record<string, unknown>)?.[LABEL_UI_CLEANUP_KEY];
      if (typeof prev === 'function') (prev as () => void)();
      if (el.parentElement) el.parentElement.removeChild(el);
    }
  });

  ensurePickHelper(group);
  const element = buildLabelDom(cfg, group.scale);
  const cssObj = createCssObject(cfg.mode, element);
  cssObj.name = 'label_css_object';
  cssObj.userData.isLabelCssObject = true;
  applyCssObjectWorldScale(cssObj, cfg);
  group.add(cssObj);
}

/** 物体 XYZ 缩放变更后，刷新 CSS2D 文案/UI 的视觉缩放（CSS2D 不吃矩阵缩放） */
export function syncLabelObjectScaleVisual(anchor: THREE.Object3D) {
  const cfg = (anchor.userData.labelConfig || createDefaultLabelConfig()) as SceneLabelConfig;
  if (cfg.mode !== 'css2d') return;

  let cssEl: HTMLElement | null = null;
  anchor.traverse((child) => {
    if (cssEl) return;
    if (child.userData?.isLabelCssObject || child.name === 'label_css_object') {
      cssEl =
        (child as CSS2DObject).element ||
        (child as CSS3DObject).element ||
        null;
    }
  });
  if (!cssEl) return;

  if (cfg.contentMode === 'uiPage' && cfg.uiPageId) {
    // UI 页需按 X 缩放重建
    syncLabelObject(anchor, cfg);
    return;
  }
  applyContentScale(cssEl, cfg, anchor.scale);
}

export function disposeLabelAnchor(anchor: THREE.Object3D) {
  const stale: THREE.Object3D[] = [];
  anchor.traverse((child) => {
    if (child.userData?.isLabelCssObject || child.name === 'label_css_object') {
      stale.push(child);
    }
  });
  stale.forEach((child) => {
    const el =
      (child as CSS2DObject).element ||
      (child as CSS3DObject).element ||
      null;
    if (el) {
      const root = el.querySelector?.('.scene-label-ui-root') || el;
      const prev = (root as unknown as Record<string, unknown>)?.[LABEL_UI_CLEANUP_KEY];
      if (typeof prev === 'function') (prev as () => void)();
      if (el.parentElement) el.parentElement.removeChild(el);
    }
    if (child.parent) child.parent.remove(child);
  });
  disposePickHelper(anchor);
}

export function isLabelObject(obj: THREE.Object3D | undefined | null): boolean {
  if (!obj) return false;
  return obj.userData?.type === 'label' || !!obj.userData?.labelConfig;
}

/** 从射线交点解析标签业务 id（拾取球挂在锚点下） */
export function resolveLabelIdFromIntersect(obj: THREE.Object3D): string | null {
  let cur: THREE.Object3D | null = obj;
  while (cur) {
    if (cur.userData?.type === 'label' && cur.userData?.id) {
      return String(cur.userData.id);
    }
    if (cur.userData?.labelPickHelper && cur.parent?.userData?.id) {
      return String(cur.parent.userData.id);
    }
    cur = cur.parent;
  }
  return null;
}

/**
 * 按屏幕坐标命中标签 HTML（pointer-events:none 时仍可 getBoundingClientRect）
 * 解决 CSS3D / 大尺寸 UI 标签仅靠小拾取球难选中的问题
 */
export function hitTestLabelAtClientPoint(clientX: number, clientY: number): string | null {
  const { objects, getThreeObject } = useSceneStore.getState();
  let best: { id: string; area: number } | null = null;

  for (const obj of objects) {
    if (obj.type !== 'label' || !obj.visible) continue;
    const anchor = getThreeObject(obj.id);
    if (!anchor || !anchor.visible) continue;

    let cssEl: HTMLElement | null = null;
    anchor.traverse((child) => {
      if (cssEl) return;
      if (child.userData?.isLabelCssObject || child.name === 'label_css_object') {
        const el =
          (child as CSS2DObject).element ||
          (child as CSS3DObject).element ||
          null;
        if (el) cssEl = el;
      }
    });
    if (!cssEl) continue;

    const rect = cssEl.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) continue;
    if (
      clientX >= rect.left &&
      clientX <= rect.right &&
      clientY >= rect.top &&
      clientY <= rect.bottom
    ) {
      const area = rect.width * rect.height;
      // 取面积最小的命中（嵌套时优先更精确的标签）
      if (!best || area < best.area) {
        best = { id: obj.id, area };
      }
    }
  }

  return best?.id ?? null;
}

export function sceneObjectToLabelConfig(obj: SceneObject): SceneLabelConfig {
  return {
    ...createDefaultLabelConfig(obj.label?.mode ?? 'css2d'),
    ...obj.label,
    scale: resolveLabelScale(obj.label),
  };
}
