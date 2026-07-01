import * as THREE from 'three';
import type { CameraTour, Vec3 } from '@/types/cameraTour';
import { DEFAULT_SPLINE_DURATION } from '@/types/cameraTour';

export interface TourSplineCurves {
  position: THREE.CatmullRomCurve3;
  target: THREE.CatmullRomCurve3;
}

function toVector3(v: Vec3) {
  return new THREE.Vector3(v.x, v.y, v.z);
}

/** 根据漫游路线构建相机位置与目标点的平滑样条曲线 */
export function buildTourSplines(tour: CameraTour): TourSplineCurves | null {
  if (tour.stops.length < 2) return null;

  const positions = tour.stops.map((s) => toVector3(s.position));
  const targets = tour.stops.map((s) => toVector3(s.target));
  const closed = Boolean(tour.loop && tour.stops.length >= 3);

  return {
    position: new THREE.CatmullRomCurve3(positions, closed, 'centripetal', 0.5),
    target: new THREE.CatmullRomCurve3(targets, closed, 'centripetal', 0.5),
  };
}

export function getSplineDuration(tour: CameraTour): number {
  return tour.splineDuration ?? DEFAULT_SPLINE_DURATION;
}

/** 在样条上采样位置与目标点，t ∈ [0, 1] */
export function sampleTourSpline(
  curves: TourSplineCurves,
  t: number
): { position: THREE.Vector3; target: THREE.Vector3 } {
  const clamped = Math.max(0, Math.min(1, t));
  return {
    position: curves.position.getPoint(clamped),
    target: curves.target.getPoint(clamped),
  };
}

/** 采样曲线用于可视化折线 */
export function sampleSplinePath(curves: TourSplineCurves, segments = 80): THREE.Vector3[] {
  return curves.position.getPoints(segments);
}

/** 导出用：采样曲线点序列 */
export function exportSplineCurvePoints(tour: CameraTour, segments = 64): Vec3[] {
  const curves = buildTourSplines(tour);
  if (!curves) return tour.stops.map((s) => ({ ...s.position }));
  return curves.position.getPoints(segments).map((p) => ({
    x: parseFloat(p.x.toFixed(3)),
    y: parseFloat(p.y.toFixed(3)),
    z: parseFloat(p.z.toFixed(3)),
  }));
}
