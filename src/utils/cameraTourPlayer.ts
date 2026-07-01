import * as THREE from 'three';
import type { CameraTour, CameraTourStop, Vec3 } from '@/types/cameraTour';
import { DEFAULT_TRANSITION_TIME, normalizeCameraTour } from '@/types/cameraTour';
import {
  buildTourSplines,
  getSplineDuration,
  sampleTourSpline,
  type TourSplineCurves,
} from '@/utils/cameraTourSpline';

export type CameraTourPlayerState = 'idle' | 'playing' | 'paused' | 'dwelling';

export interface CameraTourPlayerOptions {
  onStopChange?: (index: number, stop: CameraTourStop) => void;
  onComplete?: () => void;
  onStateChange?: (state: CameraTourPlayerState) => void;
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

function lerpVec3(out: THREE.Vector3, a: Vec3 | THREE.Vector3, b: Vec3, t: number) {
  out.set(
    a.x + (b.x - a.x) * t,
    a.y + (b.y - a.y) * t,
    a.z + (b.z - a.z) * t
  );
}

export class CameraTourPlayer {
  private camera: THREE.PerspectiveCamera;
  private controls: { target: THREE.Vector3; update: () => void; enabled: boolean };
  private tour: CameraTour;
  private options: CameraTourPlayerOptions;

  private state: CameraTourPlayerState = 'idle';
  private stopIndex = 0;
  private phase: 'transition' | 'dwell' = 'transition';
  private phaseElapsed = 0;

  private splineElapsed = 0;
  private splines: TourSplineCurves | null = null;
  private lastSplineStopIndex = -1;

  private fromPosition = new THREE.Vector3();
  private fromTarget = new THREE.Vector3();
  private tempPosition = new THREE.Vector3();
  private tempTarget = new THREE.Vector3();

  constructor(
    camera: THREE.PerspectiveCamera,
    controls: { target: THREE.Vector3; update: () => void; enabled: boolean },
    tour: CameraTour,
    options: CameraTourPlayerOptions = {}
  ) {
    this.camera = camera;
    this.controls = controls;
    this.tour = normalizeCameraTour(tour);
    this.options = options;
  }

  setTour(tour: CameraTour) {
    this.tour = normalizeCameraTour(tour);
    this.stop();
  }

  getState(): CameraTourPlayerState {
    return this.state;
  }

  getCurrentStopIndex(): number {
    if (this.tour.mode === 'spline') {
      return this.lastSplineStopIndex >= 0 ? this.lastSplineStopIndex : 0;
    }
    return this.stopIndex;
  }

  isActive(): boolean {
    return this.state === 'playing' || this.state === 'dwelling' || this.state === 'paused';
  }

  play() {
    if (this.tour.stops.length === 0) return;

    if (this.tour.mode === 'spline') {
      if (this.tour.stops.length < 2) return;
      this.splines = buildTourSplines(this.tour);
      if (!this.splines) return;
      this.controls.enabled = false;
      this.splineElapsed = 0;
      this.lastSplineStopIndex = 0;
      this.applySpline(0);
      this.setState('playing');
      return;
    }

    this.controls.enabled = false;
    this.stopIndex = 0;
    this.beginTransitionFromCurrent();
    this.setState('playing');
  }

  pause() {
    if (this.state === 'playing' || this.state === 'dwelling') {
      this.setState('paused');
    }
  }

  resume() {
    if (this.state === 'paused') {
      if (this.tour.mode === 'spline') {
        this.setState('playing');
      } else {
        this.setState(this.phase === 'dwell' ? 'dwelling' : 'playing');
      }
    }
  }

  stop() {
    this.state = 'idle';
    this.phaseElapsed = 0;
    this.splineElapsed = 0;
    this.splines = null;
    this.lastSplineStopIndex = -1;
    this.controls.enabled = true;
    this.options.onStateChange?.('idle');
  }

  goToStop(index: number, immediate = false) {
    if (index < 0 || index >= this.tour.stops.length) return;
    this.controls.enabled = false;

    if (this.tour.mode === 'spline') {
      this.splines = buildTourSplines(this.tour);
      if (!this.splines) return;
      const t = this.tour.stops.length <= 1 ? 0 : index / (this.tour.stops.length - 1);
      this.lastSplineStopIndex = index;
      if (immediate) {
        this.applySpline(t);
        this.options.onStopChange?.(index, this.tour.stops[index]);
        return;
      }
      this.splineElapsed = t * getSplineDuration(this.tour);
      this.applySpline(t);
      this.setState('playing');
      return;
    }

    this.stopIndex = index;
    if (immediate) {
      const stop = this.tour.stops[index];
      this.camera.position.set(stop.position.x, stop.position.y, stop.position.z);
      this.controls.target.set(stop.target.x, stop.target.y, stop.target.z);
      this.controls.update();
      this.options.onStopChange?.(index, stop);
      return;
    }
    this.beginTransitionFromCurrent();
    this.setState('playing');
  }

  next() {
    if (this.tour.stops.length === 0) return;
    const next = Math.min(this.getCurrentStopIndex() + 1, this.tour.stops.length - 1);
    this.goToStop(next, this.tour.mode === 'spline');
  }

  prev() {
    if (this.tour.stops.length === 0) return;
    const prev = Math.max(this.getCurrentStopIndex() - 1, 0);
    this.goToStop(prev, this.tour.mode === 'spline');
  }

  update(delta: number) {
    if (this.state !== 'playing' && this.state !== 'dwelling') return;
    if (this.tour.stops.length === 0) return;

    if (this.tour.mode === 'spline') {
      this.updateSpline(delta);
      return;
    }

    this.updateStopMode(delta);
  }

  private updateSpline(delta: number) {
    if (!this.splines) {
      this.splines = buildTourSplines(this.tour);
      if (!this.splines) return;
    }

    this.splineElapsed += delta;
    const duration = getSplineDuration(this.tour);
    let linearT = this.splineElapsed / duration;

    if (linearT >= 1) {
      if (this.tour.loop) {
        this.splineElapsed = 0;
        linearT = 0;
        this.lastSplineStopIndex = -1;
      } else {
        this.applySpline(1);
        this.emitSplineStopAt(1);
        this.stop();
        this.options.onComplete?.();
        return;
      }
    }

    const easedT = easeInOutCubic(linearT);
    this.applySpline(easedT);
    this.emitSplineStopAt(easedT);
  }

  private emitSplineStopAt(t: number) {
    const count = this.tour.stops.length;
    if (count <= 1) return;
    const index = Math.min(count - 1, Math.round(t * (count - 1)));
    if (index !== this.lastSplineStopIndex) {
      this.lastSplineStopIndex = index;
      this.options.onStopChange?.(index, this.tour.stops[index]);
    }
  }

  private applySpline(t: number) {
    if (!this.splines) return;
    const { position, target } = sampleTourSpline(this.splines, t);
    this.camera.position.copy(position);
    this.controls.target.copy(target);
    this.controls.update();
  }

  private updateStopMode(delta: number) {
    const stop = this.tour.stops[this.stopIndex];
    if (!stop) return;

    this.phaseElapsed += delta;

    if (this.phase === 'transition') {
      const duration = Math.max(stop.transitionTime, 0.001);
      const t = easeInOutCubic(Math.min(this.phaseElapsed / duration, 1));
      lerpVec3(this.tempPosition, this.fromPosition, stop.position, t);
      lerpVec3(this.tempTarget, this.fromTarget, stop.target, t);
      this.camera.position.copy(this.tempPosition);
      this.controls.target.copy(this.tempTarget);
      this.controls.update();

      if (this.phaseElapsed >= duration) {
        this.phase = 'dwell';
        this.phaseElapsed = 0;
        this.setState('dwelling');
        this.options.onStopChange?.(this.stopIndex, stop);
      }
      return;
    }

    if (this.phaseElapsed >= stop.dwellTime) {
      this.advanceToNextStop();
    }
  }

  private setState(state: CameraTourPlayerState) {
    this.state = state;
    this.options.onStateChange?.(state);
  }

  private beginTransitionFromCurrent() {
    this.fromPosition.copy(this.camera.position);
    this.fromTarget.copy(this.controls.target);
    this.phase = 'transition';
    this.phaseElapsed = 0;
  }

  private advanceToNextStop() {
    const nextIndex = this.stopIndex + 1;
    if (nextIndex >= this.tour.stops.length) {
      if (this.tour.loop && this.tour.stops.length > 0) {
        this.stopIndex = 0;
        this.beginTransitionFromCurrent();
        this.setState('playing');
        return;
      }
      this.stop();
      this.options.onComplete?.();
      return;
    }
    this.stopIndex = nextIndex;
    this.beginTransitionFromCurrent();
    this.setState('playing');
  }
}

export function captureCurrentCameraState(): { position: Vec3; target: Vec3 } | null {
  const camera = (window as { __editorCamera?: THREE.PerspectiveCamera }).__editorCamera;
  const controls = (window as { __editorControls?: { target: THREE.Vector3 } }).__editorControls;
  if (!camera || !controls) return null;
  return {
    position: {
      x: parseFloat(camera.position.x.toFixed(3)),
      y: parseFloat(camera.position.y.toFixed(3)),
      z: parseFloat(camera.position.z.toFixed(3)),
    },
    target: {
      x: parseFloat(controls.target.x.toFixed(3)),
      y: parseFloat(controls.target.y.toFixed(3)),
      z: parseFloat(controls.target.z.toFixed(3)),
    },
  };
}

/** 将编辑器相机瞬间切换到指定视角 */
export function applyEditorCameraState(position: Vec3, target: Vec3): boolean {
  cancelEditorCameraFly();
  const camera = (window as { __editorCamera?: THREE.PerspectiveCamera }).__editorCamera;
  const controls = (window as {
    __editorControls?: { target: THREE.Vector3; update: () => void; enabled: boolean };
  }).__editorControls;
  if (!camera || !controls) return false;

  camera.position.set(position.x, position.y, position.z);
  controls.target.set(target.x, target.y, target.z);
  controls.enabled = true;
  controls.update();

  syncEditorCameraGlobals(position, target);
  return true;
}

interface EditorCameraFlyState {
  fromPosition: THREE.Vector3;
  fromTarget: THREE.Vector3;
  toPosition: Vec3;
  toTarget: Vec3;
  duration: number;
  elapsed: number;
}

let editorCameraFly: EditorCameraFlyState | null = null;
const flyTempPosition = new THREE.Vector3();
const flyTempTarget = new THREE.Vector3();

function syncEditorCameraGlobals(position: Vec3, target: Vec3) {
  (window as { __editorCameraPosition?: Vec3 }).__editorCameraPosition = {
    x: parseFloat(position.x.toFixed(3)),
    y: parseFloat(position.y.toFixed(3)),
    z: parseFloat(position.z.toFixed(3)),
  };
  (window as { __editorControlsTarget?: Vec3 }).__editorControlsTarget = {
    x: parseFloat(target.x.toFixed(3)),
    y: parseFloat(target.y.toFixed(3)),
    z: parseFloat(target.z.toFixed(3)),
  };
}

/** 平滑飞向指定视角（用于漫游点「跳转视角」） */
export function startEditorCameraFly(
  position: Vec3,
  target: Vec3,
  duration = DEFAULT_TRANSITION_TIME
): boolean {
  const camera = (window as { __editorCamera?: THREE.PerspectiveCamera }).__editorCamera;
  const controls = (window as {
    __editorControls?: { target: THREE.Vector3; update: () => void; enabled: boolean };
  }).__editorControls;
  if (!camera || !controls) return false;

  editorCameraFly = {
    fromPosition: camera.position.clone(),
    fromTarget: controls.target.clone(),
    toPosition: position,
    toTarget: target,
    duration: Math.max(duration, 0.3),
    elapsed: 0,
  };
  controls.enabled = false;
  return true;
}

export function cancelEditorCameraFly() {
  editorCameraFly = null;
  const controls = (window as { __editorControls?: { enabled: boolean } }).__editorControls;
  if (controls) controls.enabled = true;
}

export function isEditorCameraFlying(): boolean {
  return editorCameraFly !== null;
}

/** 编辑器渲染循环每帧调用 */
export function tickEditorCameraFly(delta: number): boolean {
  if (!editorCameraFly) return false;

  const camera = (window as { __editorCamera?: THREE.PerspectiveCamera }).__editorCamera;
  const controls = (window as {
    __editorControls?: { target: THREE.Vector3; update: () => void; enabled: boolean };
  }).__editorControls;
  if (!camera || !controls) {
    editorCameraFly = null;
    return false;
  }

  const fly = editorCameraFly;
  fly.elapsed += delta;
  const t = easeInOutCubic(Math.min(fly.elapsed / fly.duration, 1));
  lerpVec3(flyTempPosition, fly.fromPosition, fly.toPosition, t);
  lerpVec3(flyTempTarget, fly.fromTarget, fly.toTarget, t);
  camera.position.copy(flyTempPosition);
  controls.target.copy(flyTempTarget);
  controls.update();

  syncEditorCameraGlobals(
    { x: camera.position.x, y: camera.position.y, z: camera.position.z },
    { x: controls.target.x, y: controls.target.y, z: controls.target.z }
  );

  if (fly.elapsed >= fly.duration) {
    controls.enabled = true;
    editorCameraFly = null;
  }

  return true;
}
