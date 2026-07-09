import type { UIElement } from '@/types/uiEditor';

/** 净化 HTML id */
export function sanitizeDomId(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  const safe = trimmed.replace(/[^a-zA-Z0-9_-]/g, '_');
  return /^[0-9]/.test(safe) ? `el_${safe}` : safe;
}

/** 编辑器内部使用的稳定 class（用于 hover 等） */
export function getElementEditorClass(el: UIElement): string {
  return `ui-el-${el.id.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
}

/** 导出/预览时使用的 DOM id */
export function getElementDomId(el: UIElement): string {
  const custom = el.domId?.trim();
  if (custom) {
    const safe = sanitizeDomId(custom);
    if (safe) return safe;
  }
  return getElementEditorClass(el);
}

/** 导出时使用的 class 列表 */
export function getElementExportClasses(el: UIElement): string {
  const base = `ui-el ui-el-${el.type}`;
  const custom = el.className?.trim();
  return custom ? `${custom} ${base}` : base;
}

/** Hover 选择器 */
export function getElementHoverSelector(el: UIElement): string {
  return `#${getElementDomId(el)}`;
}
