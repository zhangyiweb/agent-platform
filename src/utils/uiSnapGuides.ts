import type { UIElement } from '@/types/uiEditor';
import { getAbsolutePosition } from '@/store/uiEditorStore';

export interface SnapGuide {
  orientation: 'horizontal' | 'vertical';
  /** 画布坐标系中的位置 */
  position: number;
}

export interface SnapResult {
  x: number;
  y: number;
  guides: SnapGuide[];
}

const SNAP_THRESHOLD = 5;

function collectAxisTargets(
  elements: UIElement[],
  draggedId: string,
  parentId: string | null,
  parentWidth: number,
  parentHeight: number,
  axis: 'x' | 'y'
): number[] {
  const targets = new Set<number>();
  const size = axis === 'x' ? parentWidth : parentHeight;

  targets.add(0);
  targets.add(size / 2);
  targets.add(size);

  const siblings = elements.filter(
    (el) => el.parentId === parentId && el.id !== draggedId && el.visible
  );

  for (const el of siblings) {
    if (axis === 'x') {
      targets.add(el.x);
      targets.add(el.x + el.width / 2);
      targets.add(el.x + el.width);
    } else {
      targets.add(el.y);
      targets.add(el.y + el.height / 2);
      targets.add(el.y + el.height);
    }
  }

  return [...targets];
}

function snapAxis(
  proposed: number,
  size: number,
  targets: number[],
  threshold: number
): { snapped: number; guide: number | null } {
  const edgeDefs = [
    { edgeAt: (pos: number) => pos, snapTo: (target: number) => target },
    { edgeAt: (pos: number) => pos + size / 2, snapTo: (target: number) => target - size / 2 },
    { edgeAt: (pos: number) => pos + size, snapTo: (target: number) => target - size },
  ];

  let bestDist = threshold + 1;
  let bestSnapped = proposed;
  let bestGuide: number | null = null;

  for (const target of targets) {
    for (const { edgeAt, snapTo } of edgeDefs) {
      const dist = Math.abs(edgeAt(proposed) - target);
      if (dist <= threshold && dist < bestDist) {
        bestDist = dist;
        bestSnapped = snapTo(target);
        bestGuide = target;
      }
    }
  }

  return { snapped: bestSnapped, guide: bestGuide };
}

function localGuideToCanvas(
  orientation: 'horizontal' | 'vertical',
  localPos: number,
  parentId: string | null,
  elements: UIElement[]
): SnapGuide {
  if (!parentId) {
    return { orientation, position: localPos };
  }
  const parent = elements.find((el) => el.id === parentId);
  if (!parent) {
    return { orientation, position: localPos };
  }
  const abs = getAbsolutePosition(parent, elements);
  return {
    orientation,
    position: orientation === 'vertical' ? abs.x + localPos : abs.y + localPos,
  };
}

/** 计算拖拽吸附位置与对齐线（坐标相对于父容器） */
export function computeSnap(
  elements: UIElement[],
  draggedId: string,
  proposedX: number,
  proposedY: number,
  width: number,
  height: number,
  parentId: string | null,
  parentWidth: number,
  parentHeight: number
): SnapResult {
  const xTargets = collectAxisTargets(
    elements,
    draggedId,
    parentId,
    parentWidth,
    parentHeight,
    'x'
  );
  const yTargets = collectAxisTargets(
    elements,
    draggedId,
    parentId,
    parentWidth,
    parentHeight,
    'y'
  );

  const xSnap = snapAxis(proposedX, width, xTargets, SNAP_THRESHOLD);
  const ySnap = snapAxis(proposedY, height, yTargets, SNAP_THRESHOLD);

  const guides: SnapGuide[] = [];
  if (xSnap.guide !== null) {
    guides.push(localGuideToCanvas('vertical', xSnap.guide, parentId, elements));
  }
  if (ySnap.guide !== null) {
    guides.push(localGuideToCanvas('horizontal', ySnap.guide, parentId, elements));
  }

  return { x: xSnap.snapped, y: ySnap.snapped, guides };
}

/** 获取父容器尺寸（根元素使用画布尺寸） */
export function getParentBounds(
  parentId: string | null,
  elements: UIElement[],
  canvasWidth: number,
  canvasHeight: number
): { width: number; height: number } {
  if (!parentId) {
    return { width: canvasWidth, height: canvasHeight };
  }
  const parent = elements.find((el) => el.id === parentId);
  if (!parent) {
    return { width: canvasWidth, height: canvasHeight };
  }
  return { width: parent.width, height: parent.height };
}
