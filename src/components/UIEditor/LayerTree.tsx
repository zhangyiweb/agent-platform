import { useState } from 'react';
import { useUIEditorStore } from '@/store/uiEditorStore';
import type { UIElement } from '@/types/uiEditor';
import { canHaveChildren } from '@/types/uiEditor';
import { LAYER_DRAG_TYPE } from './UICanvas';

const typeIcons: Record<string, string> = {
  container: '▢',
  rect: '■',
  text: 'T',
  image: '🖼',
  button: '⬚',
  input: '▭',
  echart: '📊',
};

interface LayerNodeProps {
  element: UIElement;
  depth: number;
  childElements: UIElement[];
  allElements: UIElement[];
  selectedId: string | null;
  dragOverId: string | null;
  onSelect: (id: string) => void;
  onToggleVisible: (id: string) => void;
  onToggleLocked: (id: string) => void;
  onDelete: (id: string) => void;
  onDragStart: (id: string) => void;
  onDragOver: (id: string | null) => void;
  onDrop: (targetId: string | null, dragId: string) => void;
  getChildren: (parentId: string) => UIElement[];
}

function LayerNode({
  element,
  depth,
  childElements,
  allElements,
  selectedId,
  dragOverId,
  onSelect,
  onToggleVisible,
  onToggleLocked,
  onDelete,
  onDragStart,
  onDragOver,
  onDrop,
  getChildren,
}: LayerNodeProps) {
  const isContainer = canHaveChildren(element.type);
  const isDragOver = dragOverId === element.id && isContainer;

  return (
    <div className="ui-layer-branch">
      <div
        className={`ui-layer-item ${selectedId === element.id ? 'active' : ''} ${isDragOver ? 'drag-over' : ''}`}
        style={{ paddingLeft: 8 + depth * 14 }}
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData(LAYER_DRAG_TYPE, element.id);
          e.dataTransfer.effectAllowed = 'move';
          onDragStart(element.id);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (isContainer) {
            onDragOver(element.id);
          }
        }}
        onDragLeave={(e) => {
          e.stopPropagation();
          onDragOver(null);
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          const dragId = e.dataTransfer.getData(LAYER_DRAG_TYPE);
          if (dragId && dragId !== element.id && isContainer) {
            onDrop(element.id, dragId);
          }
          onDragOver(null);
        }}
        onClick={() => onSelect(element.id)}
      >
        <span className="ui-layer-drag">⠿</span>
        <span className="ui-layer-icon">{typeIcons[element.type] || '?'}</span>
        <span className="ui-layer-name">{element.name}</span>
        <div className="ui-layer-actions">
          <button
            type="button"
            className={element.visible ? '' : 'inactive'}
            onClick={(e) => {
              e.stopPropagation();
              onToggleVisible(element.id);
            }}
            title={element.visible ? '隐藏' : '显示'}
          >
            {element.visible ? '👁' : '—'}
          </button>
          <button
            type="button"
            className={element.locked ? 'active' : ''}
            onClick={(e) => {
              e.stopPropagation();
              onToggleLocked(element.id);
            }}
            title={element.locked ? '解锁' : '锁定'}
          >
            {element.locked ? '🔒' : '🔓'}
          </button>
          <button
            type="button"
            className="danger"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(element.id);
            }}
            title="删除"
          >
            ×
          </button>
        </div>
      </div>

      {childElements.map((child) => (
        <LayerNode
          key={child.id}
          element={child}
          depth={depth + 1}
          childElements={getChildren(child.id)}
          allElements={allElements}
          selectedId={selectedId}
          dragOverId={dragOverId}
          onSelect={onSelect}
          onToggleVisible={onToggleVisible}
          onToggleLocked={onToggleLocked}
          onDelete={onDelete}
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDrop={onDrop}
          getChildren={getChildren}
        />
      ))}
    </div>
  );
}

export function LayerTree() {
  const {
    elements,
    selectedId,
    selectElement,
    toggleVisible,
    toggleLocked,
    deleteElement,
    reparentElement,
    getChildren,
  } = useUIEditorStore();

  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const roots = getChildren(null).slice().reverse();

  const handleDrop = (targetId: string | null, dragId: string) => {
    if (dragId === targetId) return;
    reparentElement(dragId, targetId);
    setDraggingId(null);
    setDragOverId(null);
  };

  return (
    <div className="ui-layer-tree">
      <div className="ui-panel-header">
        <span>图层</span>
        <span className="ui-panel-hint">{elements.length} 个 · 拖入容器嵌套</span>
      </div>

      <div
        className={`ui-layer-root-zone ${dragOverId === '__root__' ? 'drag-over' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          if (draggingId) setDragOverId('__root__');
        }}
        onDragLeave={() => setDragOverId(null)}
        onDrop={(e) => {
          e.preventDefault();
          const dragId = e.dataTransfer.getData(LAYER_DRAG_TYPE);
          if (dragId) handleDrop(null, dragId);
        }}
      >
        拖到此处移至根层级
      </div>

      <div className="ui-layer-list">
        {roots.length === 0 ? (
          <div className="ui-layer-empty">暂无图层，从组件库拖入元素</div>
        ) : (
          roots.map((el) => (
            <LayerNode
              key={el.id}
              element={el}
              depth={0}
              childElements={getChildren(el.id)}
              allElements={elements}
              selectedId={selectedId}
              dragOverId={dragOverId}
              onSelect={selectElement}
              onToggleVisible={toggleVisible}
              onToggleLocked={toggleLocked}
              onDelete={deleteElement}
              onDragStart={setDraggingId}
              onDragOver={setDragOverId}
              onDrop={handleDrop}
              getChildren={getChildren}
            />
          ))
        )}
      </div>
    </div>
  );
}
