import type { UIElement, UIElementStyle } from '@/types/uiEditor';
import { getEchartOption, parseEchartPresetId } from '@/config/echartPresets';
import { buildHoverCssRules, hasHoverStyle } from '@/utils/uiHoverStyle';
import { getElementDomId, getElementExportClasses, getElementHoverSelector } from '@/utils/uiElementDom';

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
      rules.push(`${prop}:${escapeStyleValue(value)}`);
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
  return rules.join(';');
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
    'width:100%',
    'height:100%',
    'border:none',
    'outline:none',
    'background:transparent',
    'box-sizing:border-box',
    style.color ? `color:${escapeStyleValue(style.color)}` : '',
    style.fontSize !== undefined ? `font-size:${toVw(style.fontSize, canvasWidth)}` : '',
    style.fontWeight !== undefined ? `font-weight:${style.fontWeight}` : '',
    style.fontFamily && style.fontFamily !== 'inherit' ? `font-family:${escapeStyleValue(style.fontFamily)}` : '',
    style.padding !== undefined ? `padding:${toVw(style.padding, canvasWidth)}` : '',
  ].filter(Boolean);
  return rules.join(';');
}

export interface UIExportBundle {
  bodyHtml: string;
  baseCss: string;
  hoverCss: string;
  chartInitJs: string;
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
  const hoverRules: string[] = [];
  const chartInits: { domId: string; optionJson: string }[] = [];

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

    if (hasHoverStyle(el.hoverStyle)) {
      const hoverCss = buildHoverCssRules(el.hoverStyle!);
      if (hoverCss) hoverRules.push(`${getElementHoverSelector(el)}:hover{${hoverCss}}`);
    }

    switch (el.type) {
      case 'image': {
        const imgStyle = `width:100%;height:100%;object-fit:${el.style.objectFit || 'cover'};display:block`;
        const imgTag = el.src ? `<img src="${el.src}" alt="${escapeHtml(el.name)}" style="${imgStyle}" />` : '';
        return `<div id="${domId}" class="${cls}" style="${baseStyle}">${imgTag}${childHtml}</div>`;
      }
      case 'button':
        return `<button id="${domId}" type="button" class="${cls}" style="${baseStyle};border:none;outline:none;appearance:none;-webkit-appearance:none;cursor:pointer"><span class="ui-el-text">${escapeHtml(el.content || '按钮')}</span>${childHtml}</button>`;
      case 'input': {
        const inputStyle = buildInputInnerStyle(el, styleCtx);
        return `<div id="${domId}" class="${cls}" style="${baseStyle}"><input type="text" class="ui-el-native-input" placeholder="${escapeHtml(el.content || '请输入')}" style="${inputStyle}" />${childHtml}</div>`;
      }
      case 'text':
        return `<div id="${domId}" class="${cls}" style="${baseStyle}"><span class="ui-el-text">${escapeHtml(el.content || '')}</span>${childHtml}</div>`;
      case 'echart': {
        const presetId = parseEchartPresetId(el.content);
        const optionJson = JSON.stringify(getEchartOption(presetId, el.chartConfig));
        chartInits.push({ domId, optionJson });
        return `<div id="${domId}" class="${cls} ui-el-echart-host" style="${baseStyle}"><div class="ui-el-echart" style="width:100%;height:100%"></div>${childHtml}</div>`;
      }
      default:
        return `<div id="${domId}" class="${cls}" style="${baseStyle}">${childHtml}</div>`;
    }
  }

  const bodyHtml = getChildren(null).map(renderNode).join('\n    ');

  const baseCss = `* { margin: 0; padding: 0; box-sizing: border-box; }
html, body {
  width: 100%;
  height: 100%;
  overflow: hidden;
  font-family: "Microsoft YaHei", "PingFang SC", sans-serif;
}
.ui-page {
  position: relative;
  width: 100vw;
  height: 100vh;
  background: ${escapeStyleValue(canvasBackground)};
  overflow: hidden;
}
.ui-el { position: absolute; box-sizing: border-box; }
.ui-el-text { width: 100%; display: block; word-break: break-word; }
button.ui-el { cursor: pointer; font: inherit; color: inherit; text-align: inherit; }
button.ui-el .ui-el-text { pointer-events: none; }
.ui-el-native-input { font-family: inherit; }
.ui-el-native-input::placeholder { color: rgba(156,163,175,0.8); }
.ui-el img { display: block; }`;

  const hoverCss = hoverRules.join('\n');

  const chartConfigs = chartInits.map((c) => ({ domId: c.domId, optionJson: c.optionJson }));
  const chartInitJs =
    chartConfigs.length > 0
      ? `(function () {
  var configs = ${JSON.stringify(chartConfigs)};
  var instances = [];
  function initCharts() {
    if (!window.echarts) return;
    configs.forEach(function (cfg) {
      var host = document.getElementById(cfg.domId);
      if (!host) return;
      var container = host.querySelector('.ui-el-echart');
      if (!container) return;
      var chart = echarts.init(container);
      chart.setOption(JSON.parse(cfg.optionJson));
      instances.push(chart);
    });
  }
  initCharts();
  window.addEventListener('resize', function () {
    instances.forEach(function (c) { c.resize(); });
  });
})();`
      : '';

  return {
    bodyHtml,
    baseCss,
    hoverCss,
    chartInitJs,
    hasCharts: chartConfigs.length > 0,
  };
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

  const chartScript = bundle.hasCharts
    ? `
  <script src="https://cdn.jsdelivr.net/npm/echarts@5.5.1/dist/echarts.min.js"><\/script>
  <script>${bundle.chartInitJs}<\/script>`
    : '';

  const hoverBlock = bundle.hoverCss ? `\n    ${bundle.hoverCss}` : '';

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>UI 页面</title>
  <style>
    ${bundle.baseCss}${hoverBlock}
  </style>
</head>
<body>
  <div class="ui-page" data-design-width="${canvasWidth}" data-design-height="${canvasHeight}">
    ${bundle.bodyHtml}
  </div>${chartScript}
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
