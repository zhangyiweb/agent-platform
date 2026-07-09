import type { UIElement, UIElementStyle } from '@/types/uiEditor';

export interface ParsedCssResult {
  elementPatch: Partial<Pick<UIElement, 'width' | 'height' | 'x' | 'y' | 'content'>>;
  stylePatch: Partial<UIElementStyle>;
  applied: string[];
  unrecognized: string[];
}

function parsePx(value: string): number | undefined {
  const match = value.trim().match(/^(-?\d+(?:\.\d+)?)px$/i);
  return match ? Math.round(parseFloat(match[1])) : undefined;
}

function parseNumber(value: string): number | undefined {
  const num = parseFloat(value.trim());
  return Number.isFinite(num) ? num : undefined;
}

function isColorValue(value: string): boolean {
  const v = value.trim();
  return (
    /^#([0-9a-f]{3,8})$/i.test(v) ||
    /^rgba?\(/i.test(v) ||
    /^hsla?\(/i.test(v) ||
    /^[a-z]+$/i.test(v)
  );
}

function normalizeColor(value: string): string {
  const v = value.trim();
  if (/^rgba?\(/i.test(v)) {
    return v.replace(/\s*\/\s*/g, ' ').replace(/,\s*/g, ', ');
  }
  return v;
}

function parseBorder(value: string): Partial<UIElementStyle> {
  const parts = value.trim().split(/\s+/);
  const result: Partial<UIElementStyle> = {};

  for (const part of parts) {
    if (/^(solid|dashed|dotted|none)$/i.test(part)) {
      result.borderStyle = part.toLowerCase() as UIElementStyle['borderStyle'];
    } else if (isColorValue(part)) {
      result.borderColor = normalizeColor(part);
    } else {
      const width = parsePx(part);
      if (width !== undefined) result.borderWidth = width;
    }
  }

  return result;
}

function parsePadding(value: string): Partial<UIElementStyle> {
  const parts = value.trim().split(/\s+/).map((p) => parsePx(p)).filter((p) => p !== undefined) as number[];
  if (parts.length === 0) return {};
  if (parts.length === 1) return { padding: parts[0] };
  if (parts.length === 2) return { paddingTop: parts[0], paddingRight: parts[1], paddingBottom: parts[0], paddingLeft: parts[1] };
  if (parts.length === 3) return { paddingTop: parts[0], paddingRight: parts[1], paddingBottom: parts[2], paddingLeft: parts[1] };
  return { paddingTop: parts[0], paddingRight: parts[1], paddingBottom: parts[2], paddingLeft: parts[3] };
}

function mapTextAlign(value: string): UIElementStyle['textAlign'] | undefined {
  const v = value.trim().toLowerCase();
  if (v === 'left' || v === 'center' || v === 'right') return v;
  if (v === 'start') return 'left';
  if (v === 'end') return 'right';
  return undefined;
}

function mapBackgroundRepeat(value: string): UIElementStyle['backgroundRepeat'] | undefined {
  const v = value.trim().toLowerCase();
  if (v === 'repeat' || v === 'no-repeat' || v === 'repeat-x' || v === 'repeat-y') return v;
  return undefined;
}

/** 解析蓝湖等设计工具复制的 CSS 片段 */
export function parseLanhuCss(cssText: string): ParsedCssResult {
  const elementPatch: ParsedCssResult['elementPatch'] = {};
  const stylePatch: Partial<UIElementStyle> = {};
  const applied: string[] = [];
  const unrecognized: string[] = [];

  const cleaned = cssText
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/[{}]/g, '\n')
    .trim();

  const declarations = cleaned
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);

  for (const decl of declarations) {
    const colonIndex = decl.indexOf(':');
    if (colonIndex < 0) continue;

    const prop = decl.slice(0, colonIndex).trim().toLowerCase();
    const value = decl.slice(colonIndex + 1).trim();
    if (!value) continue;

    let handled = true;

    switch (prop) {
      case 'width':
        elementPatch.width = parsePx(value);
        break;
      case 'height':
        elementPatch.height = parsePx(value);
        break;
      case 'left':
        elementPatch.x = parsePx(value);
        break;
      case 'top':
        elementPatch.y = parsePx(value);
        break;
      case 'font-size':
        stylePatch.fontSize = parsePx(value) ?? parseNumber(value);
        break;
      case 'font-family':
        stylePatch.fontFamily = value.replace(/['"]/g, '"');
        break;
      case 'font-weight':
        stylePatch.fontWeight = parseNumber(value) ?? value;
        break;
      case 'color':
        if (isColorValue(value)) stylePatch.color = normalizeColor(value);
        break;
      case 'background-color':
        if (isColorValue(value) || value.startsWith('url(')) {
          stylePatch.backgroundColor = normalizeColor(value);
        }
        break;
      case 'background':
        if (value.startsWith('url(')) {
          const urlMatch = value.match(/url\((['"]?)(.*?)\1\)/i);
          if (urlMatch) stylePatch.backgroundImage = urlMatch[2];
        } else if (isColorValue(value.split(/\s+/)[0])) {
          stylePatch.backgroundColor = normalizeColor(value.split(/\s+/)[0]);
        }
        break;
      case 'background-image':
        if (value.startsWith('url(')) {
          const urlMatch = value.match(/url\((['"]?)(.*?)\1\)/i);
          if (urlMatch) stylePatch.backgroundImage = urlMatch[2];
        }
        break;
      case 'background-size':
        stylePatch.backgroundSize = value;
        break;
      case 'background-position':
        stylePatch.backgroundPosition = value;
        break;
      case 'background-repeat':
        stylePatch.backgroundRepeat = mapBackgroundRepeat(value);
        break;
      case 'border-radius':
        stylePatch.borderRadius = parsePx(value) ?? parseNumber(value);
        break;
      case 'border':
        Object.assign(stylePatch, parseBorder(value));
        break;
      case 'border-width':
        stylePatch.borderWidth = parsePx(value) ?? parseNumber(value);
        break;
      case 'border-color':
        stylePatch.borderColor = normalizeColor(value);
        break;
      case 'border-style':
        stylePatch.borderStyle = value as UIElementStyle['borderStyle'];
        break;
      case 'opacity':
        stylePatch.opacity = parseNumber(value);
        break;
      case 'box-shadow':
        stylePatch.boxShadow = value;
        break;
      case 'text-shadow':
        stylePatch.textShadow = value;
        break;
      case 'line-height': {
        const px = parsePx(value);
        stylePatch.lineHeight = px !== undefined ? px : parseNumber(value) ?? value;
        break;
      }
      case 'letter-spacing':
        stylePatch.letterSpacing = parsePx(value) ?? parseNumber(value);
        break;
      case 'text-align':
        stylePatch.textAlign = mapTextAlign(value);
        break;
      case 'padding':
        Object.assign(stylePatch, parsePadding(value));
        break;
      case 'padding-top':
        stylePatch.paddingTop = parsePx(value);
        break;
      case 'padding-right':
        stylePatch.paddingRight = parsePx(value);
        break;
      case 'padding-bottom':
        stylePatch.paddingBottom = parsePx(value);
        break;
      case 'padding-left':
        stylePatch.paddingLeft = parsePx(value);
        break;
      case 'margin':
        stylePatch.margin = parsePx(value.split(/\s+/)[0]);
        break;
      case 'overflow':
        if (['visible', 'hidden', 'auto', 'scroll'].includes(value)) {
          stylePatch.overflow = value as UIElementStyle['overflow'];
        }
        break;
      case 'backdrop-filter':
        stylePatch.backdropFilter = value;
        break;
      case 'display':
      case 'position':
      case 'z-index':
      case 'transform':
      case 'flex-direction':
      case 'justify-content':
      case 'align-items':
      case 'gap':
      case 'white-space':
      case 'word-break':
      case 'content':
        if (prop === 'content' && value !== 'none' && value !== 'normal') {
          elementPatch.content = value.replace(/^['"]|['"]$/g, '');
        } else if (prop === 'flex-direction' && (value === 'row' || value === 'column')) {
          stylePatch.flexDirection = value;
        } else if (prop === 'justify-content') {
          stylePatch.justifyContent = value;
        } else if (prop === 'align-items') {
          stylePatch.alignItems = value;
        } else if (prop === 'gap') {
          stylePatch.gap = parsePx(value);
        } else {
          handled = false;
        }
        break;
      default:
        handled = false;
    }

    if (handled) {
      applied.push(`${prop}: ${value}`);
    } else {
      unrecognized.push(`${prop}: ${value}`);
    }
  }

  return { elementPatch, stylePatch, applied, unrecognized };
}
