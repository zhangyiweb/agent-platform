import type { UIElement, UIElementStyle } from '@/types/uiEditor';
import { getEchartOption, parseEchartPresetId } from '@/config/echartPresets';
import { buildHoverCssRules, hasHoverStyle } from '@/utils/uiHoverStyle';
import { getElementDomId, getElementExportClasses, getElementHoverSelector } from '@/utils/uiElementDom';

const ECHARTS_CDN = 'https://cdn.jsdelivr.net/npm/echarts@5.5.1/dist/echarts.min.js';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeStyleValue(value: string | number): string {
  return String(value).replace(/"/g, '&quot;');
}

function toPercent(px: number, base: number): string {
  if (!base) return '0%';
  return `${(px / base) * 100}%`;
}

function toVw(px: number, canvasWidth: number): string {
  return `${(px / canvasWidth) * 100}vw`;
}

/** 将相对资源路径转为相对 css/style.css 可解析的路径 */
function toCssAssetPath(path: string): string {
  const trimmed = path.trim().replace(/^["']|["']$/g, '');
  if (/^(https?:|data:|\/|\.\.\/)/.test(trimmed)) return trimmed;
  return `../${trimmed}`;
}

/** 外链样式表中，修正所有相对 url() 为相对 css/ 目录 */
function fixCssAssetPathsForExternalSheet(css: string): string {
  return css.replace(
    /url\((['"]?)(?!https?:|data:|\/|\.\.\/)([^)'"]+)\1\)/g,
    (_match, quote: string, path: string) => `url(${quote}${toCssAssetPath(path)}${quote})`
  );
}

interface StyleContext {
  parentWidth: number;
  parentHeight: number;
  canvasWidth: number;
  canvasHeight: number;
}

export interface UIExportContext {
  resolveImage: (elementId: string, dataUrl: string, kind: 'src' | 'background') => string;
}

function identityImageResolver(_elementId: string, dataUrl: string): string {
  return dataUrl;
}

function resolveElementAssets(el: UIElement, ctx?: UIExportContext): UIElement {
  if (!ctx) return el;
  const next = { ...el, style: { ...el.style } };
  if (next.src?.startsWith('data:')) {
    next.src = ctx.resolveImage(el.id, next.src, 'src');
  }
  if (next.style.backgroundImage?.startsWith('data:')) {
    next.style.backgroundImage = ctx.resolveImage(el.id, next.style.backgroundImage, 'background');
  }
  return next;
}

function styleToCss(
  style: UIElementStyle,
  ctx: StyleContext,
  extra: Record<string, string | number> = {}
): string {
  const { canvasWidth } = ctx;
  const rules: string[] = [];

  const add = (prop: string, value: string | number | undefined) => {
    if (value !== undefined && value !== '' && value !== null) {
      rules.push(`${prop}: ${escapeStyleValue(value)}`);
    }
  };

  add('background-color', style.backgroundColor);
  add('color', style.color);
  if (style.fontSize !== undefined) add('font-size', toVw(style.fontSize, canvasWidth));
  add('font-weight', style.fontWeight);
  if (style.fontFamily && style.fontFamily !== 'inherit') add('font-family', style.fontFamily);
  add('text-align', style.textAlign);
  if (style.lineHeight !== undefined) {
    const lh = style.lineHeight;
    add('line-height', typeof lh === 'number' && lh < 10 ? lh : typeof lh === 'number' ? toVw(lh, canvasWidth) : lh);
  }
  if (style.letterSpacing !== undefined) add('letter-spacing', toVw(style.letterSpacing, canvasWidth));
  if (style.borderRadius !== undefined) add('border-radius', toVw(style.borderRadius, canvasWidth));
  add('opacity', style.opacity);
  add('box-shadow', style.boxShadow);
  add('text-shadow', style.textShadow);
  add('overflow', style.overflow);
  if (style.padding !== undefined) add('padding', toVw(style.padding, canvasWidth));
  if (style.paddingTop !== undefined) add('padding-top', toVw(style.paddingTop, canvasWidth));
  if (style.paddingRight !== undefined) add('padding-right', toVw(style.paddingRight, canvasWidth));
  if (style.paddingBottom !== undefined) add('padding-bottom', toVw(style.paddingBottom, canvasWidth));
  if (style.paddingLeft !== undefined) add('padding-left', toVw(style.paddingLeft, canvasWidth));
  add('transition', 'all 0.2s ease');

  if (style.backgroundImage) {
    const img = style.backgroundImage.startsWith('url(')
      ? style.backgroundImage
      : `url(${style.backgroundImage})`;
    add('background-image', img);
    add('background-size', style.backgroundSize || 'cover');
    add('background-position', style.backgroundPosition || 'center');
    add('background-repeat', style.backgroundRepeat || 'no-repeat');
  }

  if (style.borderWidth && style.borderStyle !== 'none') {
    add(
      'border',
      `${toVw(style.borderWidth, canvasWidth)} ${style.borderStyle || 'solid'} ${style.borderColor || '#404040'}`
    );
  }

  Object.entries(extra).forEach(([key, value]) => add(key, value));
  return rules.join('; ');
}

function getFlexLayout(el: UIElement): Record<string, string> {
  const { style } = el;
  const isTextLike = el.type === 'text' || el.type === 'button';

  if (!isTextLike) return { display: 'block' };

  return {
    display: 'flex',
    'align-items': style.textAlign === 'center' ? 'center' : 'flex-start',
    'justify-content':
      style.textAlign === 'center' ? 'center' : style.textAlign === 'right' ? 'flex-end' : 'flex-start',
  };
}

function buildElementStyle(el: UIElement, ctx: StyleContext): string {
  const { parentWidth, parentHeight } = ctx;
  return styleToCss(el.style, ctx, {
    position: 'absolute',
    left: toPercent(el.x, parentWidth),
    top: toPercent(el.y, parentHeight),
    width: toPercent(el.width, parentWidth),
    height: toPercent(el.height, parentHeight),
    'box-sizing': 'border-box',
    'z-index': el.zIndex,
    ...getFlexLayout(el),
  });
}

function buildInputInnerStyle(el: UIElement, ctx: StyleContext): string {
  const { canvasWidth } = ctx;
  const { style } = el;
  const rules = [
    'width: 100%',
    'height: 100%',
    'border: none',
    'outline: none',
    'background: transparent',
    'box-sizing: border-box',
    style.color ? `color: ${escapeStyleValue(style.color)}` : '',
    style.fontSize !== undefined ? `font-size: ${toVw(style.fontSize, canvasWidth)}` : '',
    style.fontWeight !== undefined ? `font-weight: ${style.fontWeight}` : '',
    style.fontFamily && style.fontFamily !== 'inherit' ? `font-family: ${escapeStyleValue(style.fontFamily)}` : '',
    style.padding !== undefined ? `padding: ${toVw(style.padding, canvasWidth)}` : '',
  ].filter(Boolean);
  return rules.join('; ');
}

/** 将声明字符串格式化为可读的 CSS 规则块 */
function formatCssRule(selector: string, declarations: string): string {
  const props = declarations
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => `  ${part};`)
    .join('\n');
  return `${selector} {\n${props}\n}`;
}

export interface UIExportBundle {
  bodyHtml: string;
  baseCss: string;
  elementCss: string;
  hoverCss: string;
  mainJs: string;
  hasCharts: boolean;
}

export function buildUIExportBundle(
  elements: UIElement[],
  canvasWidth: number,
  canvasHeight: number,
  canvasBackground: string,
  ctx?: UIExportContext
): UIExportBundle {
  const prepared = elements.map((el) => resolveElementAssets(el, ctx));
  const elementMap = new Map(prepared.map((el) => [el.id, el]));
  const elementCssRules: string[] = [];
  const hoverRules: string[] = [];
  const chartInits: { domId: string; option: Record<string, unknown> }[] = [];

  function getChildren(parentId: string | null): UIElement[] {
    return prepared
      .filter((el) => el.parentId === parentId && el.visible)
      .sort((a, b) => a.zIndex - b.zIndex);
  }

  function getParentSize(el: UIElement): { width: number; height: number } {
    if (!el.parentId) return { width: canvasWidth, height: canvasHeight };
    const parent = elementMap.get(el.parentId);
    return parent ? { width: parent.width, height: parent.height } : { width: canvasWidth, height: canvasHeight };
  }

  function pushElementRule(selector: string, declarations: string) {
    if (declarations.trim()) {
      elementCssRules.push(formatCssRule(selector, declarations));
    }
  }

  function renderNode(el: UIElement): string {
    const parentSize = getParentSize(el);
    const styleCtx: StyleContext = {
      parentWidth: parentSize.width,
      parentHeight: parentSize.height,
      canvasWidth,
      canvasHeight,
    };

    const childHtml = getChildren(el.id).map(renderNode).join('\n');
    const baseStyle = buildElementStyle(el, styleCtx);
    const cls = getElementExportClasses(el);
    const domId = getElementDomId(el);
    const selector = `#${domId}`;

    if (hasHoverStyle(el.hoverStyle)) {
      const hoverDeclarations = buildHoverCssRules(el.hoverStyle!);
      if (hoverDeclarations) {
        hoverRules.push(formatCssRule(`${getElementHoverSelector(el)}:hover`, hoverDeclarations));
      }
    }

    switch (el.type) {
      case 'image': {
        pushElementRule(selector, baseStyle);
        const imgStyle = `width: 100%; height: 100%; object-fit: ${el.style.objectFit || 'cover'}; display: block`;
        pushElementRule(`${selector} img`, imgStyle);
        const imgTag = el.src ? `    <img src="${el.src}" alt="${escapeHtml(el.name)}" />` : '';
        return `<div id="${domId}" class="${cls}">\n${imgTag}\n${childHtml}\n  </div>`;
      }
      case 'button': {
        pushElementRule(
          selector,
          `${baseStyle}; border: none; outline: none; appearance: none; -webkit-appearance: none; cursor: pointer`
        );
        return `<button id="${domId}" type="button" class="${cls}">\n    <span class="ui-el-text">${escapeHtml(el.content || '按钮')}</span>\n${childHtml}\n  </button>`;
      }
      case 'input': {
        pushElementRule(selector, baseStyle);
        const inputStyle = buildInputInnerStyle(el, styleCtx);
        pushElementRule(`${selector} .ui-el-native-input`, inputStyle);
        return `<div id="${domId}" class="${cls}">\n    <input type="text" class="ui-el-native-input" placeholder="${escapeHtml(el.content || '请输入')}" />\n${childHtml}\n  </div>`;
      }
      case 'text':
        pushElementRule(selector, baseStyle);
        return `<div id="${domId}" class="${cls}">\n    <span class="ui-el-text">${escapeHtml(el.content || '')}</span>\n${childHtml}\n  </div>`;
      case 'echart': {
        pushElementRule(selector, baseStyle);
        const presetId = parseEchartPresetId(el.content);
        const option = getEchartOption(presetId, el.chartConfig) as Record<string, unknown>;
        chartInits.push({ domId, option });
        pushElementRule(`${selector} .ui-el-echart`, 'width: 100%; height: 100%');
        return `<div id="${domId}" class="${cls} ui-el-echart-host">\n    <div class="ui-el-echart"></div>\n${childHtml}\n  </div>`;
      }
      default:
        pushElementRule(selector, baseStyle);
        return `<div id="${domId}" class="${cls}">\n${childHtml}\n  </div>`;
    }
  }

  const bodyHtml = getChildren(null).map(renderNode).join('\n    ');

  const baseCss = `/* ===== 全局重置 ===== */
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html,
body {
  width: 100%;
  height: 100%;
  overflow: hidden;
  font-family: "Microsoft YaHei", "PingFang SC", system-ui, sans-serif;
}

/* ===== 页面容器 ===== */
.ui-page {
  position: relative;
  width: 100vw;
  height: 100vh;
  background: ${escapeStyleValue(canvasBackground)};
  overflow: hidden;
}

/* ===== 通用元素类 ===== */
.ui-el {
  position: absolute;
  box-sizing: border-box;
}

.ui-el-text {
  width: 100%;
  display: block;
  word-break: break-word;
}

button.ui-el {
  cursor: pointer;
  font: inherit;
  color: inherit;
  text-align: inherit;
}

button.ui-el .ui-el-text {
  pointer-events: none;
}

.ui-el-native-input {
  font-family: inherit;
}

.ui-el-native-input::placeholder {
  color: rgba(156, 163, 175, 0.8);
}

.ui-el img {
  display: block;
}`;

  const elementCss =
    elementCssRules.length > 0
      ? `/* ===== 元素布局与样式 ===== */\n${elementCssRules.join('\n\n')}`
      : '';

  const hoverCss =
    hoverRules.length > 0 ? `/* ===== 悬停效果 ===== */\n${hoverRules.join('\n\n')}` : '';

  const mainJs = buildUIMainJs(chartInits);

  return {
    bodyHtml,
    baseCss,
    elementCss,
    hoverCss,
    mainJs,
    hasCharts: chartInits.length > 0,
  };
}

/** 生成入口 JS（图表初始化 + 二次开发钩子） */
export function buildUIMainJs(chartInits: { domId: string; option: Record<string, unknown> }[]): string {
  const chartBlock =
    chartInits.length > 0
      ? `
  /** ECharts 图表配置，可直接修改 option 对接动态数据 */
  var chartConfigs = ${JSON.stringify(chartInits, null, 2)};
  var chartInstances = [];

  function initCharts() {
    if (typeof echarts === 'undefined') return;
    chartConfigs.forEach(function (cfg) {
      var host = document.getElementById(cfg.domId);
      if (!host) return;
      var container = host.querySelector('.ui-el-echart');
      if (!container) return;
      var chart = echarts.init(container);
      chart.setOption(cfg.option);
      chartInstances.push(chart);
    });
  }

  function resizeCharts() {
    chartInstances.forEach(function (chart) {
      chart.resize();
    });
  }`
      : '';

  const initChartsCall = chartInits.length > 0 ? '\n    initCharts();\n    window.addEventListener(\'resize\', resizeCharts);' : '';

  return `/**
 * UI 页面入口脚本
 *
 * 可在此文件中：
 * - 为按钮、输入框等元素绑定事件
 * - 对接后端接口、WebSocket 等
 * - 修改 chartConfigs 中的 option 实现图表动态更新
 */
(function () {
  'use strict';
${chartBlock}

  function onReady(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn);
    } else {
      fn();
    }
  }

  onReady(function () {${initChartsCall}

    // —— 二次开发入口 ——
    // 示例：
    // var btn = document.getElementById('my-button');
    // if (btn) btn.addEventListener('click', function () { console.log('clicked'); });
  });
})();
`;
}

/** 合并完整样式表；external 为 true 时路径相对 css/style.css（默认，用于外链 CSS） */
export function buildUIStyleCss(bundle: UIExportBundle, options?: { external?: boolean }): string {
  const sections = [bundle.baseCss, bundle.elementCss, bundle.hoverCss].filter(Boolean);
  const css = sections.join('\n\n');
  return options?.external === false ? css : fixCssAssetPathsForExternalSheet(css);
}

/** 生成标准 index.html（外链 CSS / JS） */
export function buildUIIndexHtml(
  bundle: UIExportBundle,
  canvasWidth: number,
  canvasHeight: number,
  title = 'UI 页面'
): string {
  const echartsScript = bundle.hasCharts
    ? `  <script src="${ECHARTS_CDN}"><\/script>\n`
    : '';

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)}</title>
  <link rel="stylesheet" href="./css/style.css" />
</head>
<body>
  <div class="ui-page" data-design-width="${canvasWidth}" data-design-height="${canvasHeight}">
    ${bundle.bodyHtml}
  </div>
${echartsScript}  <script src="./js/main.js"><\/script>
</body>
</html>
`;
}

export function generateUIHtml(
  elements: UIElement[],
  canvasWidth: number,
  canvasHeight: number,
  canvasBackground: string
): string {
  const bundle = buildUIExportBundle(elements, canvasWidth, canvasHeight, canvasBackground, {
    resolveImage: identityImageResolver,
  });

  const styleCss = buildUIStyleCss(bundle, { external: false });
  const echartsScript = bundle.hasCharts
    ? `\n  <script src="${ECHARTS_CDN}"><\/script>\n  <script>\n${bundle.mainJs}\n  <\/script>`
    : `\n  <script>\n${bundle.mainJs}\n  <\/script>`;

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>UI 页面</title>
  <style>
${styleCss}
  </style>
</head>
<body>
  <div class="ui-page" data-design-width="${canvasWidth}" data-design-height="${canvasHeight}">
    ${bundle.bodyHtml}
  </div>${echartsScript}
</body>
</html>`;
}

export function downloadUIHtmlPage(
  elements: UIElement[],
  canvasWidth: number,
  canvasHeight: number,
  canvasBackground: string,
  filename = 'ui-page.html'
): void {
  const html = generateUIHtml(elements, canvasWidth, canvasHeight, canvasBackground);
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function parseDataUrl(dataUrl: string): { ext: string; bytes: Uint8Array } | null {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  const mime = match[1];
  const ext = mime.includes('png')
    ? 'png'
    : mime.includes('jpeg') || mime.includes('jpg')
      ? 'jpg'
      : mime.includes('webp')
        ? 'webp'
        : mime.includes('gif')
          ? 'gif'
          : 'png';
  const binary = atob(match[2]);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return { ext, bytes };
}

export function bytesToDataUrl(bytes: Uint8Array, ext: string): string {
  const mime =
    ext === 'jpg' || ext === 'jpeg'
      ? 'image/jpeg'
      : ext === 'png'
        ? 'image/png'
        : ext === 'webp'
          ? 'image/webp'
          : ext === 'gif'
            ? 'image/gif'
            : 'application/octet-stream';
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return `data:${mime};base64,${btoa(binary)}`;
}
