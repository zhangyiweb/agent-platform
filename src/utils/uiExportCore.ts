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
  // 写入 <style> textContent，不能用 HTML 实体（&quot; 不会被解析成引号）
  return String(value).replace(/\n/g, ' ');
}

function toPercent(px: number, base: number): string {
  if (!base) return '0%';
  return `${(px / base) * 100}%`;
}

function toVw(px: number, canvasWidth: number): string {
  return `${(px / canvasWidth) * 100}vw`;
}

function toPx(px: number): string {
  return `${px}px`;
}

/** 全屏叠层用 vw；标签内嵌等固定设计稿用 px（与编辑器一致） */
export type UIExportSizeUnit = 'vw' | 'px';

function toLength(px: number, canvasWidth: number, unit: UIExportSizeUnit): string {
  return unit === 'px' ? toPx(px) : toVw(px, canvasWidth);
}

/** 外链样式表中，修正所有相对 url()；prefix 默认为 ../（相对 css/ 目录） */
function fixCssAssetPathsForExternalSheet(css: string, assetPrefix = '../'): string {
  const prefix = assetPrefix.endsWith('/') ? assetPrefix : `${assetPrefix}/`;
  return css.replace(
    /url\((['"]?)(?!https?:|data:|\/|\.\.\/)([^)'"]+)\1\)/g,
    (_match, quote: string, path: string) => `url(${quote}${prefix}${path}${quote})`
  );
}

interface StyleContext {
  parentWidth: number;
  parentHeight: number;
  canvasWidth: number;
  canvasHeight: number;
  sizeUnit: UIExportSizeUnit;
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
  const { canvasWidth, sizeUnit } = ctx;
  const rules: string[] = [];

  const add = (prop: string, value: string | number | undefined) => {
    if (value !== undefined && value !== '' && value !== null) {
      rules.push(`${prop}: ${escapeStyleValue(value)}`);
    }
  };

  const len = (px: number) => toLength(px, canvasWidth, sizeUnit);

  add('background-color', style.backgroundColor);
  add('color', style.color);
  if (style.fontSize !== undefined) add('font-size', len(style.fontSize));
  add('font-weight', style.fontWeight);
  if (style.fontFamily && style.fontFamily !== 'inherit') add('font-family', style.fontFamily);
  add('text-align', style.textAlign);
  if (style.lineHeight !== undefined) {
    const lh = style.lineHeight;
    add('line-height', typeof lh === 'number' && lh < 10 ? lh : typeof lh === 'number' ? len(lh) : lh);
  }
  if (style.letterSpacing !== undefined) add('letter-spacing', len(style.letterSpacing));
  if (style.borderRadius !== undefined) add('border-radius', len(style.borderRadius));
  add('opacity', style.opacity);
  add('box-shadow', style.boxShadow);
  add('text-shadow', style.textShadow);
  add('overflow', style.overflow);
  if (style.padding !== undefined) add('padding', len(style.padding));
  if (style.paddingTop !== undefined) add('padding-top', len(style.paddingTop));
  if (style.paddingRight !== undefined) add('padding-right', len(style.paddingRight));
  if (style.paddingBottom !== undefined) add('padding-bottom', len(style.paddingBottom));
  if (style.paddingLeft !== undefined) add('padding-left', len(style.paddingLeft));
  if (style.margin !== undefined) add('margin', len(style.margin));
  if (style.gap !== undefined) add('gap', len(style.gap));
  add('flex-direction', style.flexDirection);
  add('justify-content', style.justifyContent);
  add('align-items', style.alignItems);
  add('backdrop-filter', style.backdropFilter);
  add('cursor', style.cursor);
  add('transition', 'all 0.2s ease');

  if (style.backgroundImage) {
    const raw = style.backgroundImage.trim();
    // data URL 禁止再用 ; split 逻辑破坏；统一加引号包住
    const img = raw.startsWith('url(')
      ? raw
      : `url("${raw.replace(/"/g, '%22')}")`;
    add('background-image', img);
    add('background-size', style.backgroundSize || 'cover');
    add('background-position', style.backgroundPosition || 'center');
    add('background-repeat', style.backgroundRepeat || 'no-repeat');
  }

  if (style.borderWidth && style.borderStyle !== 'none') {
    add(
      'border',
      `${len(style.borderWidth)} ${style.borderStyle || 'solid'} ${style.borderColor || '#404040'}`
    );
  }

  Object.entries(extra).forEach(([key, value]) => add(key, value));
  return rules.join('; ');
}

function getFlexLayout(el: UIElement): Record<string, string> {
  const { style } = el;
  const isTextLike = el.type === 'text' || el.type === 'button' || el.type === 'input';
  const isBlockHost =
    el.type === 'container' || el.type === 'rect' || el.type === 'echart' || el.type === 'image';

  if (isBlockHost) return { display: 'block' };
  if (!isTextLike) return { display: 'block' };

  const verticalAlignMap: Record<string, string> = {
    top: 'flex-start',
    center: 'center',
    bottom: 'flex-end',
  };

  const layout: Record<string, string> = {
    display: 'flex',
  };

  // 与编辑器 UIElementView 一致：未手动设对齐时，用 verticalAlign / textAlign
  if (!style.alignItems) {
    layout['align-items'] =
      verticalAlignMap[style.verticalAlign || 'center'] || 'center';
  }
  if (!style.justifyContent) {
    layout['justify-content'] =
      style.textAlign === 'center'
        ? 'center'
        : style.textAlign === 'right'
          ? 'flex-end'
          : 'flex-start';
  }

  return layout;
}

function buildElementStyle(el: UIElement, ctx: StyleContext): string {
  const { parentWidth, parentHeight, sizeUnit } = ctx;
  // px 模式：位置/尺寸用绝对像素，与画布编辑器一致，避免百分比换算导致间距漂移
  const box =
    sizeUnit === 'px'
      ? {
          left: `${el.x}px`,
          top: `${el.y}px`,
          width: `${el.width}px`,
          height: `${el.height}px`,
        }
      : {
          left: toPercent(el.x, parentWidth),
          top: toPercent(el.y, parentHeight),
          width: toPercent(el.width, parentWidth),
          height: toPercent(el.height, parentHeight),
        };

  return styleToCss(el.style, ctx, {
    position: 'absolute',
    ...box,
    'box-sizing': 'border-box',
    'z-index': el.zIndex,
    ...getFlexLayout(el),
  });
}

function buildInputInnerStyle(el: UIElement, ctx: StyleContext): string {
  const { canvasWidth, sizeUnit } = ctx;
  const { style } = el;
  const len = (px: number) => toLength(px, canvasWidth, sizeUnit);
  const rules = [
    'width: 100%',
    'height: 100%',
    'border: none',
    'outline: none',
    'background: transparent',
    'box-sizing: border-box',
    style.color ? `color: ${escapeStyleValue(style.color)}` : '',
    style.fontSize !== undefined ? `font-size: ${len(style.fontSize)}` : '',
    style.fontWeight !== undefined ? `font-weight: ${style.fontWeight}` : '',
    style.fontFamily && style.fontFamily !== 'inherit' ? `font-family: ${escapeStyleValue(style.fontFamily)}` : '',
    style.padding !== undefined ? `padding: ${len(style.padding)}` : '',
  ].filter(Boolean);
  return rules.join('; ');
}

/** 将声明字符串格式化为可读的 CSS 规则块（不拆分 url() 内的分号，避免 data:image/png;base64 被截断） */
function formatCssRule(selector: string, declarations: string): string {
  const parts: string[] = [];
  let buf = '';
  let urlDepth = 0;

  for (let i = 0; i < declarations.length; i += 1) {
    const ch = declarations[i];
    const prev = buf.slice(-3).toLowerCase();
    if (ch === '(' && (prev.endsWith('url') || /url\s*$/i.test(buf))) {
      urlDepth += 1;
    } else if (ch === ')' && urlDepth > 0) {
      urlDepth -= 1;
    }

    if (ch === ';' && urlDepth === 0) {
      const trimmed = buf.trim();
      if (trimmed) parts.push(trimmed);
      buf = '';
      continue;
    }
    buf += ch;
  }
  const last = buf.trim();
  if (last) parts.push(last);

  const props = parts.map((part) => `  ${part};`).join('\n');
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
  ctx?: UIExportContext,
  options?: { includeHidden?: boolean; sizeUnit?: UIExportSizeUnit }
): UIExportBundle {
  const prepared = elements.map((el) => resolveElementAssets(el, ctx));
  const elementMap = new Map(prepared.map((el) => [el.id, el]));
  const elementCssRules: string[] = [];
  const hoverRules: string[] = [];
  const chartInits: { domId: string; option: Record<string, unknown> }[] = [];
  const includeHidden = options?.includeHidden === true;
  const sizeUnit: UIExportSizeUnit = options?.sizeUnit ?? 'vw';

  function getChildren(parentId: string | null): UIElement[] {
    return prepared
      .filter((el) => el.parentId === parentId && (includeHidden || el.visible))
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
      sizeUnit,
    };

    const childHtml = getChildren(el.id).map(renderNode).join('\n');
    const hasActions = Array.isArray(el.actions) && el.actions.length > 0;
    const cls = `${getElementExportClasses(el)}${hasActions ? ' ui-interactive' : ''}`;
    const domId = getElementDomId(el);
    const selector = `#${domId}`;
    const dataAttrs = `data-ui-id="${escapeHtml(el.id)}"`;
    const hiddenStyle = includeHidden && !el.visible ? '; display: none; visibility: hidden' : '';
    const baseStyle = `${buildElementStyle(el, styleCtx)}${hiddenStyle}`;

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
        return `<div id="${domId}" class="${cls}" ${dataAttrs}>\n${imgTag}\n${childHtml}\n  </div>`;
      }
      case 'button': {
        pushElementRule(
          selector,
          `${baseStyle}; border: none; outline: none; appearance: none; -webkit-appearance: none; cursor: pointer`
        );
        return `<button id="${domId}" type="button" class="${cls}" ${dataAttrs}>\n    <span class="ui-el-text">${escapeHtml(el.content || '按钮')}</span>\n${childHtml}\n  </button>`;
      }
      case 'input': {
        pushElementRule(selector, baseStyle);
        const inputStyle = buildInputInnerStyle(el, styleCtx);
        pushElementRule(`${selector} .ui-el-native-input`, inputStyle);
        return `<div id="${domId}" class="${cls}" ${dataAttrs}>\n    <input type="text" class="ui-el-native-input" placeholder="${escapeHtml(el.content || '请输入')}" />\n${childHtml}\n  </div>`;
      }
      case 'text':
        pushElementRule(selector, baseStyle);
        return `<div id="${domId}" class="${cls}" ${dataAttrs}>\n    <span class="ui-el-text">${escapeHtml(el.content || '')}</span>\n${childHtml}\n  </div>`;
      case 'echart': {
        pushElementRule(selector, baseStyle);
        const presetId = parseEchartPresetId(el.content);
        const option = getEchartOption(presetId, el.chartConfig) as Record<string, unknown>;
        chartInits.push({ domId, option });
        pushElementRule(`${selector} .ui-el-echart`, 'width: 100%; height: 100%');
        return `<div id="${domId}" class="${cls} ui-el-echart-host" ${dataAttrs}>\n    <div class="ui-el-echart"></div>\n${childHtml}\n  </div>`;
      }
      default:
        pushElementRule(selector, baseStyle);
        return `<div id="${domId}" class="${cls}" ${dataAttrs}>\n${childHtml}\n  </div>`;
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

/** 合并完整样式表；external 为 true 时修正相对资源路径（默认，用于外链 CSS） */
export function buildUIStyleCss(
  bundle: UIExportBundle,
  options?: { external?: boolean; assetPrefix?: string }
): string {
  const sections = [bundle.baseCss, bundle.elementCss, bundle.hoverCss].filter(Boolean);
  const css = sections.join('\n\n');
  if (options?.external === false) return css;
  return fixCssAssetPathsForExternalSheet(css, options?.assetPrefix ?? '../');
}

/** 生成标准 index.html（外链 CSS / JS） */
export function buildUIIndexHtml(
  bundle: UIExportBundle,
  canvasWidth: number,
  canvasHeight: number,
  title = 'UI 页面',
  options?: { cssHref?: string; jsSrc?: string }
): string {
  const cssHref = options?.cssHref ?? './css/style.css';
  const jsSrc = options?.jsSrc ?? './js/main.js';
  const echartsScript = bundle.hasCharts
    ? `  <script src="${ECHARTS_CDN}"><\/script>\n`
    : '';

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)}</title>
  <link rel="stylesheet" href="${cssHref}" />
</head>
<body>
  <div class="ui-page" data-design-width="${canvasWidth}" data-design-height="${canvasHeight}">
    ${bundle.bodyHtml}
  </div>
${echartsScript}  <script src="${jsSrc}"><\/script>
</body>
</html>
`;
}

/** 将导出 HTML 片段转为 React JSX 属性约定 */
export function htmlFragmentToJsx(html: string): string {
  return html
    .replace(/\bclass=/g, 'className=')
    .replace(/\bfor=/g, 'htmlFor=')
    .replace(/\bstroke-width=/g, 'strokeWidth=')
    .replace(/\bstroke-linecap=/g, 'strokeLinecap=')
    .replace(/\bstroke-linejoin=/g, 'strokeLinejoin=')
    .replace(/\bclip-path=/g, 'clipPath=')
    .replace(/\bfill-rule=/g, 'fillRule=');
}

/** 生成 Vue SFC */
export function buildVueSfc(
  bundle: UIExportBundle,
  canvasWidth: number,
  canvasHeight: number,
  componentName: string,
  styleOptions?: { external?: boolean; assetPrefix?: string }
): string {
  const styleCss = buildUIStyleCss(bundle, styleOptions ?? { external: false });
  const chartSetup = bundle.hasCharts
    ? `import { onMounted, onBeforeUnmount } from 'vue'
import * as echarts from 'echarts'

${extractChartConfigsLiteral(bundle.mainJs)}

let chartInstances = []

function resizeCharts() {
  chartInstances.forEach((c) => c.resize())
}

onMounted(() => {
  chartConfigs.forEach((cfg) => {
    const host = document.getElementById(cfg.domId)
    if (!host) return
    const container = host.querySelector('.ui-el-echart')
    if (!container) return
    const chart = echarts.init(container)
    chart.setOption(cfg.option)
    chartInstances.push(chart)
  })
  window.addEventListener('resize', resizeCharts)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', resizeCharts)
  chartInstances.forEach((c) => c.dispose())
  chartInstances = []
})`
    : `// 可在此绑定按钮点击、表单提交等业务逻辑`;

  return `<!-- ${componentName}.vue — 由数字孪生平台 UI 编排导出 -->
<template>
  <div class="ui-page" data-design-width="${canvasWidth}" data-design-height="${canvasHeight}">
${indentBlock(bundle.bodyHtml, 4)}
  </div>
</template>

<script setup>
${chartSetup}
</script>

<style>
${styleCss}
</style>
`;
}

/** 生成 React 函数组件 */
export function buildReactComponent(
  bundle: UIExportBundle,
  canvasWidth: number,
  canvasHeight: number,
  componentName: string,
  cssImportPath: string
): string {
  const jsxBody = htmlFragmentToJsx(bundle.bodyHtml);
  const chartConfigsDecl = bundle.hasCharts
    ? `\n${extractChartConfigsLiteral(bundle.mainJs, true)}\n`
    : '';

  const chartBlock = bundle.hasCharts
    ? `
  useEffect(() => {
    const instances: ReturnType<typeof echarts.init>[] = [];
    chartConfigs.forEach((cfg) => {
      const host = document.getElementById(cfg.domId);
      if (!host) return;
      const container = host.querySelector('.ui-el-echart') as HTMLElement | null;
      if (!container) return;
      const chart = echarts.init(container);
      chart.setOption(cfg.option);
      instances.push(chart);
    });
    const onResize = () => instances.forEach((c) => c.resize());
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      instances.forEach((c) => c.dispose());
    };
  }, []);
`
    : '';

  return `/**
 * ${componentName} — 由数字孪生平台 UI 编排导出
 * 二次开发：在组件内绑定事件，或修改 chartConfigs 对接动态数据
 */
${bundle.hasCharts ? "import { useEffect } from 'react';\n" : ''}import './${cssImportPath}';
${bundle.hasCharts ? "import * as echarts from 'echarts';\n" : ''}${chartConfigsDecl}
export default function ${componentName}() {${chartBlock}
  return (
    <div className="ui-page" data-design-width="${canvasWidth}" data-design-height="${canvasHeight}">
${indentBlock(jsxBody, 6)}
    </div>
  );
}
`;
}

function indentBlock(text: string, spaces: number): string {
  const pad = ' '.repeat(spaces);
  return text
    .split('\n')
    .map((line) => (line.trim() ? pad + line : line))
    .join('\n');
}

/** 从 main.js 中提取 chartConfigs 字面量声明 */
function extractChartConfigsLiteral(mainJs: string, asTs = false): string {
  const match = mainJs.match(/var chartConfigs = (\[[\s\S]*?\]);/);
  if (!match) {
    return asTs
      ? 'const chartConfigs: { domId: string; option: Record<string, unknown> }[] = [];'
      : 'const chartConfigs = [];';
  }
  return asTs
    ? `const chartConfigs = ${match[1]} as { domId: string; option: Record<string, unknown> }[];`
    : `const chartConfigs = ${match[1]};`;
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
