import * as THREE from 'three';
import type { CameraTour } from '@/types/cameraTour';
import { normalizeCameraTour } from '@/types/cameraTour';
import { buildTourSplines, sampleSplinePath } from '@/utils/cameraTourSpline';

const PATH_NAME = 'helper_tour_path';
const MARKER_PREFIX = 'helper_tour_marker_';

const LABEL_FONT = 'bold 22px "Microsoft YaHei", "PingFang SC", sans-serif';
const LABEL_MAX_WIDTH = 220;

function disposeObject3D(obj: THREE.Object3D) {
  obj.traverse((child) => {
    if (child instanceof THREE.Mesh || child instanceof THREE.Line) {
      child.geometry?.dispose();
      const mat = child.material;
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
      else mat?.dispose();
    }
    if (child instanceof THREE.Sprite) {
      child.material.map?.dispose();
      child.material.dispose();
    }
  });
}

function truncateLabel(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let truncated = text;
  while (truncated.length > 0 && ctx.measureText(`${truncated}…`).width > maxWidth) {
    truncated = truncated.slice(0, -1);
  }
  return `${truncated}…`;
}

function createLabelSprite(text: string, accent: number): THREE.Sprite {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  const paddingX = 10;
  const paddingY = 6;
  const fontSize = 22;

  ctx.font = LABEL_FONT;
  const displayText = truncateLabel(ctx, text, LABEL_MAX_WIDTH);
  const textWidth = ctx.measureText(displayText).width;
  const width = Math.ceil(textWidth + paddingX * 2);
  const height = fontSize + paddingY * 2;

  canvas.width = width;
  canvas.height = height;

  ctx.font = LABEL_FONT;
  ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
  const strokeColor = accent === 0x22d3ee ? 'rgba(34, 211, 238, 0.9)' : 'rgba(255, 204, 0, 0.85)';
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = 2;
  const radius = 6;
  ctx.beginPath();
  ctx.moveTo(radius, 0);
  ctx.lineTo(width - radius, 0);
  ctx.quadraticCurveTo(width, 0, width, radius);
  ctx.lineTo(width, height - radius);
  ctx.quadraticCurveTo(width, height, width - radius, height);
  ctx.lineTo(radius, height);
  ctx.quadraticCurveTo(0, height, 0, height - radius);
  ctx.lineTo(0, radius);
  ctx.quadraticCurveTo(0, 0, radius, 0);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#f9fafb';
  ctx.textBaseline = 'middle';
  ctx.fillText(displayText, paddingX, height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(material);
  const worldHeight = 0.55;
  const aspect = width / height;
  sprite.scale.set(worldHeight * aspect, worldHeight, 1);
  sprite.position.y = 0.42;
  sprite.renderOrder = 1000;
  sprite.userData.isEditorHelper = true;
  return sprite;
}

export function syncTourPathVisual(scene: THREE.Scene, tour: CameraTour | null) {
  removeTourPathVisual(scene);

  if (!tour || tour.stops.length === 0) return;

  const normalized = normalizeCameraTour(tour);
  const isSpline = normalized.mode === 'spline';
  const pathColor = isSpline ? 0x22d3ee : 0xffcc00;
  const markerDefault = isSpline ? 0x22d3ee : 0xffcc00;

  if (normalized.stops.length >= 2) {
    let pathPoints: THREE.Vector3[];

    if (isSpline) {
      const curves = buildTourSplines(normalized);
      pathPoints = curves ? sampleSplinePath(curves, 80) : [];
    } else {
      pathPoints = normalized.stops.map(
        (s) => new THREE.Vector3(s.position.x, s.position.y, s.position.z)
      );
    }

    if (pathPoints.length >= 2) {
      const geometry = new THREE.BufferGeometry().setFromPoints(pathPoints);
      const line = new THREE.Line(
        geometry,
        new THREE.LineBasicMaterial({ color: pathColor, linewidth: 2 })
      );
      line.name = PATH_NAME;
      line.userData.isEditorHelper = true;
      scene.add(line);
    }
  }

  normalized.stops.forEach((stop, index) => {
    const group = new THREE.Group();
    group.name = `${MARKER_PREFIX}${index}`;
    group.userData.isEditorHelper = true;
    group.position.set(stop.position.x, stop.position.y, stop.position.z);

    const markerColor = stop.type === 'focus' ? 0x3b82f6 : markerDefault;
    const marker = new THREE.Mesh(
      new THREE.SphereGeometry(0.15, 12, 12),
      new THREE.MeshBasicMaterial({ color: markerColor })
    );
    marker.userData.isEditorHelper = true;
    group.add(marker);

    const label = createLabelSprite(`${index + 1}. ${stop.name}`, markerColor);
    group.add(label);

    scene.add(group);
  });
}

export function removeTourPathVisual(scene: THREE.Scene) {
  const toRemove: THREE.Object3D[] = [];
  scene.traverse((child) => {
    if (child.name === PATH_NAME || child.name.startsWith(MARKER_PREFIX)) {
      toRemove.push(child);
    }
  });
  toRemove.forEach((obj) => {
    scene.remove(obj);
    disposeObject3D(obj);
  });
}
