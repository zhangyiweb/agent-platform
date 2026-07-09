import type { UIElementStyle } from '@/types/uiEditor';

export function buildHoverCssRules(hoverStyle: Partial<UIElementStyle>): string {
  const rules: string[] = [];
  const add = (prop: string, value: string | number | undefined) => {
    if (value !== undefined && value !== '' && value !== null) {
      rules.push(`${prop}:${value}`);
    }
  };

  add('background-color', hoverStyle.backgroundColor);
  add('color', hoverStyle.color);
  if (hoverStyle.fontSize !== undefined) add('font-size', `${hoverStyle.fontSize}px`);
  add('opacity', hoverStyle.opacity);
  add('box-shadow', hoverStyle.boxShadow);
  add('border-color', hoverStyle.borderColor);
  if (hoverStyle.borderWidth !== undefined) {
    add('border-width', `${hoverStyle.borderWidth}px`);
  }
  if (hoverStyle.borderRadius !== undefined) add('border-radius', `${hoverStyle.borderRadius}px`);
  add('transform', hoverStyle.cursor === 'pointer' ? 'translateY(-1px)' : undefined);

  return rules.join(';');
}

export function hasHoverStyle(hoverStyle?: Partial<UIElementStyle>): boolean {
  if (!hoverStyle) return false;
  return Object.values(hoverStyle).some((v) => v !== undefined && v !== '');
}
