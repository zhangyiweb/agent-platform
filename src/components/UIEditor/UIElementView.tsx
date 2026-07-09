import type { CSSProperties } from 'react';
import type { UIElement, UIElementStyle } from '@/types/uiEditor';
import { canHaveChildren } from '@/types/uiEditor';
import { buildHoverCssRules, hasHoverStyle } from '@/utils/uiHoverStyle';
import { getElementDomId, getElementEditorClass, getElementHoverSelector } from '@/utils/uiElementDom';
import { EchartRenderer } from './EchartRenderer';

interface UIElementViewProps {
  element: UIElement;
  children: UIElement[];
  selected: boolean;
  selectedId: string | null;
  scale: number;
  onSelect: (id: string) => void;
  onMoveStart: (id: string, e: React.MouseEvent) => void;
  onResizeStart: (id: string, handle: ResizeHandle, e: React.MouseEvent) => void;
  renderChild: (child: UIElement) => React.ReactNode;
  isDropTarget?: boolean;
}

export type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

const HANDLES: ResizeHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

function buildElementStyle(element: UIElement): CSSProperties {
  const { style } = element;

  const verticalAlignMap: Record<string, string> = {
    top: 'flex-start',
    center: 'center',
    bottom: 'flex-end',
  };

  const isTextLike =
    element.type === 'text' || element.type === 'button' || element.type === 'input';

  const css: CSSProperties = {
    position: 'absolute',
    left: element.x,
    top: element.y,
    width: element.width,
    height: element.height,
    zIndex: element.zIndex,
    opacity: style.opacity ?? 1,
    backgroundColor: style.backgroundColor,
    color: style.color,
    fontSize: style.fontSize,
    fontWeight: style.fontWeight,
    fontFamily: style.fontFamily || 'inherit',
    textAlign: style.textAlign,
    borderRadius: style.borderRadius,
    border:
      style.borderStyle === 'none' || !style.borderWidth
        ? undefined
        : `${style.borderWidth}px ${style.borderStyle || 'solid'} ${style.borderColor || '#404040'}`,
    padding: style.padding,
    paddingTop: style.paddingTop,
    paddingRight: style.paddingRight,
    paddingBottom: style.paddingBottom,
    paddingLeft: style.paddingLeft,
    margin: style.margin,
    lineHeight: style.lineHeight,
    letterSpacing: style.letterSpacing,
    boxShadow: style.boxShadow,
    textShadow: style.textShadow,
    overflow:
      style.overflow ??
      (canHaveChildren(element.type) || element.type === 'echart' ? 'hidden' : undefined),
    gap: style.gap,
    flexDirection: style.flexDirection,
    justifyContent: style.justifyContent,
    alignItems: style.alignItems,
    backdropFilter: style.backdropFilter,
    cursor: element.locked ? 'not-allowed' : style.cursor || (element.type === 'button' ? 'pointer' : 'move'),
    userSelect: 'none',
    boxSizing: 'border-box',
    display: element.type === 'container' || element.type === 'rect' || element.type === 'echart'
      ? 'block'
      : isTextLike
        ? 'flex'
        : 'block',
    transition: hasHoverStyle(element.hoverStyle) ? 'all 0.2s ease' : undefined,
  };

  if (!style.alignItems && isTextLike) {
    css.alignItems = verticalAlignMap[style.verticalAlign || 'center'] || 'center';
  }

  if (!style.justifyContent && isTextLike) {
    css.justifyContent =
      style.textAlign === 'center'
        ? 'center'
        : style.textAlign === 'right'
          ? 'flex-end'
          : 'flex-start';
  }

  if (style.backgroundImage) {
    css.backgroundImage = `url(${style.backgroundImage})`;
    css.backgroundSize = style.backgroundSize || 'cover';
    css.backgroundPosition = style.backgroundPosition || 'center';
    css.backgroundRepeat = style.backgroundRepeat || 'no-repeat';
  }

  return css;
}

function buildInputStyle(style: UIElementStyle): CSSProperties {
  return {
    width: '100%',
    height: '100%',
    border: 'none',
    outline: 'none',
    background: 'transparent',
    color: style.color || '#e5e7eb',
    fontSize: style.fontSize,
    fontWeight: style.fontWeight,
    fontFamily: style.fontFamily || 'inherit',
    padding: style.padding ?? 0,
    pointerEvents: 'none',
  };
}

export function UIElementView({
  element,
  children,
  selected,
  scale,
  onSelect,
  onMoveStart,
  onResizeStart,
  renderChild,
  isDropTarget,
}: UIElementViewProps) {
  if (!element.visible) return null;

  const { style } = element;
  const baseStyle = buildElementStyle(element);
  const hoverCss = element.hoverStyle ? buildHoverCssRules(element.hoverStyle) : '';
  const editorClass = getElementEditorClass(element);
  const domId = getElementDomId(element);
  const customClass = element.className?.trim() || '';

  const handleMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (element.locked) return;
    onSelect(element.id);
    onMoveStart(element.id, e);
  };

  const renderContent = () => {
    switch (element.type) {
      case 'image':
        if (element.src) {
          return (
            <img
              src={element.src}
              alt={element.name}
              draggable={false}
              style={{
                width: '100%',
                height: '100%',
                objectFit: style.objectFit || 'cover',
                pointerEvents: 'none',
                display: 'block',
              }}
            />
          );
        }
        return (
          <div className="ui-element-placeholder">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
              <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="1.5" />
              <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor" />
              <path d="M21 15L16 10L5 21" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <span>拖入图片或上传切图</span>
          </div>
        );
      case 'input':
        return (
          <input
            type="text"
            readOnly
            tabIndex={-1}
            placeholder={element.content || '请输入'}
            style={buildInputStyle(style)}
          />
        );
      case 'echart':
        return (
          <EchartRenderer
            elementId={element.id}
            presetId={element.content}
            chartConfig={element.chartConfig}
          />
        );
      case 'container':
      case 'rect':
        return element.content ? (
          <span
            style={{
              color: style.color,
              fontSize: 12,
              opacity: 0.6,
              position: 'absolute',
              top: 4,
              left: 6,
              pointerEvents: 'none',
            }}
          >
            {element.content}
          </span>
        ) : null;
      default:
        return <span style={{ width: '100%', pointerEvents: 'none' }}>{element.content}</span>;
    }
  };

  return (
    <>
      {hoverCss ? (
        <style>{`${getElementHoverSelector(element)}:hover{${hoverCss}}`}</style>
      ) : null}
      <div
        id={domId}
        className={`ui-element ${editorClass} ${customClass} ${element.type === 'container' ? 'ui-element--area' : ''} ${selected ? 'selected' : ''} ${element.locked ? 'locked' : ''} ${isDropTarget ? 'drop-target' : ''}`}
        style={baseStyle}
        onMouseDown={handleMouseDown}
      >
        {renderContent()}
        {children.map((child) => renderChild(child))}

        {selected && !element.locked && (
          <>
            <div className="ui-element-selection-border" />
            {HANDLES.map((handle) => (
              <div
                key={handle}
                className={`ui-resize-handle ui-resize-${handle}`}
                style={{ transform: `scale(${1 / scale})` }}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  onResizeStart(element.id, handle, e);
                }}
              />
            ))}
          </>
        )}
      </div>
    </>
  );
}
