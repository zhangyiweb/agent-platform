import * as THREE from 'three';
import {
  ParticleSystem,
  BatchedRenderer,
  SphereEmitter,
  ConeEmitter,
  PointEmitter,
  GridEmitter,
  ConstantValue,
  IntervalValue,
  ConstantColor,
  ColorOverLife,
  SizeOverLife,
  Gradient,
  PiecewiseBezier,
  Bezier,
  ApplyForce,
  TurbulenceField,
  RotationOverLife,
  RenderMode,
  Vector3,
  Vector4,
  type Behavior,
  type ParticleSystemJSONParameters,
} from 'three.quarks';
import type { ParticleEmitterConfig, ParticleEmitShape, ParticlePresetId } from '@/types/particle';
import { resolveParticleTexture } from '@/particles/particleTextures';

export interface QuarksParticleEntry {
  system: ParticleSystem;
  root: THREE.Object3D;
  helper: THREE.LineSegments | null;
}

const EMIT_AXIS = new THREE.Vector3(0, 0, 1);
const _dir = new THREE.Vector3();
const _quat = new THREE.Quaternion();

/** 水平铺开发射面、粒子向下落的天气类预设 */
const FALLING_WEATHER_PRESETS: ParticlePresetId[] = ['rain', 'snow', 'confetti'];

function isFallingWeatherPreset(config: ParticleEmitterConfig) {
  return FALLING_WEATHER_PRESETS.includes(config.preset);
}

function hexToVec3(hex: string): Vector3 {
  const c = new THREE.Color(hex);
  return new Vector3(c.r, c.g, c.b);
}

function createEmitterShape(config: ParticleEmitterConfig) {
  const [sx, , sz] = config.emitSize;

  switch (config.emitShape as ParticleEmitShape) {
    case 'sphere':
      return new SphereEmitter({
        radius: Math.max(sx, sz) * 0.5,
        thickness: 1,
      });
    case 'cone':
      return new ConeEmitter({
        radius: Math.max(sx, sz) * 0.5,
        angle: Math.max(0.05, config.spread),
      });
    case 'box': {
      const width = Math.max(sx, 0.5);
      const height = Math.max(sz, 0.5);
      return new GridEmitter({
        width,
        height,
        column: Math.max(12, Math.round(width * 1.5)),
        row: Math.max(12, Math.round(height * 1.5)),
      });
    }
    default:
      return new PointEmitter();
  }
}

function createParticleMaterial(config: ParticleEmitterConfig): THREE.MeshBasicMaterial {
  const map = resolveParticleTexture(config);
  return new THREE.MeshBasicMaterial({
    map,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending:
      config.blendMode === 'additive' ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
}

function buildBehaviors(config: ParticleEmitterConfig): Behavior[] {
  const behaviors: Behavior[] = [
    new SizeOverLife(
      new PiecewiseBezier([
        [new Bezier(config.sizeStart, config.sizeStart, config.sizeEnd, config.sizeEnd), 0],
      ])
    ),
    new ColorOverLife(
      new Gradient(
        [
          [hexToVec3(config.colorStart), 0],
          [hexToVec3(config.colorEnd), 1],
        ],
        [
          [config.opacityStart, 0],
          [config.opacityEnd, 1],
        ]
      )
    ),
    new ApplyForce(
      new Vector3(config.gravity[0], config.gravity[1], config.gravity[2]),
      new ConstantValue(1)
    ),
  ];

  if (config.turbulence > 0.01) {
    behaviors.push(
      new TurbulenceField(
        new Vector3(2, 2, 2),
        config.turbulence,
        new Vector3(1, 2, 1),
        new Vector3(0.08, 0.08, 0.08)
      )
    );
  }

  if (Math.abs(config.rotationSpeed) > 0.01) {
    behaviors.push(
      new RotationOverLife(
        new IntervalValue(-config.rotationSpeed, config.rotationSpeed)
      )
    );
  }

  return behaviors;
}

function applyEmitterLayout(emitter: THREE.Object3D, config: ParticleEmitterConfig) {
  emitter.rotation.set(0, 0, 0);

  if (isFallingWeatherPreset(config)) {
    // GridEmitter 沿局部 +Z 发射；绕 X 轴 +90° 使速度对齐世界 -Y（向下落）
    emitter.rotation.x = Math.PI / 2;
    return;
  }

  alignEmitterDirection(emitter, config.direction);
}

/** 将编辑器配置转为 three.quarks ParticleSystem */
export function buildQuarksParticleSystem(config: ParticleEmitterConfig): ParticleSystem {
  if (config.customQuarksJson) {
    const fromCustom = tryBuildFromCustomJson(config.customQuarksJson);
    if (fromCustom) return fromCustom;
  }

  const material = createParticleMaterial(config);
  const fallingWeather = isFallingWeatherPreset(config);

  const system = new ParticleSystem({
    duration: config.duration > 0 ? config.duration : 5,
    looping: config.loop,
    prewarm: true,
    shape: createEmitterShape(config),
    startLife: new IntervalValue(config.lifetimeMin, config.lifetimeMax),
    startSpeed: new IntervalValue(config.speedMin, config.speedMax),
    startSize: new ConstantValue(Math.max(config.sizeStart, 0.02)),
    startColor: new ConstantColor(new Vector4(1, 1, 1, config.opacityStart)),
    emissionOverTime: new ConstantValue(config.enabled ? config.emissionRate : 0),
    worldSpace: fallingWeather,
    softParticles: false,
    renderMode: RenderMode.BillBoard,
    rendererEmitterSettings: {},
    material,
    behaviors: buildBehaviors(config),
  });

  system.restart();
  applyEmitterLayout(system.emitter, config);
  return system;
}

function alignEmitterDirection(emitter: THREE.Object3D, direction: [number, number, number]) {
  _dir.set(direction[0], direction[1], direction[2]);
  if (_dir.lengthSq() < 1e-6) return;
  _dir.normalize();
  // Cone / Grid 等形状沿局部 +Z 发射，需将 +Z 对齐到目标方向
  _quat.setFromUnitVectors(EMIT_AXIS, _dir);
  emitter.quaternion.copy(_quat);
}

function tryBuildFromCustomJson(jsonText: string): ParticleSystem | null {
  try {
    const parsed = JSON.parse(jsonText) as Record<string, unknown>;

    if (parsed.version && parsed.shape) {
      const meta = buildMinimalMetaFromJson(parsed as unknown as ParticleSystemJSONParameters);
      return ParticleSystem.fromJSON(
        parsed as unknown as ParticleSystemJSONParameters,
        meta,
        {}
      );
    }

    return null;
  } catch {
    return null;
  }
}

function buildMinimalMetaFromJson(json: ParticleSystemJSONParameters) {
  const materials: Record<string, THREE.Material> = {};

  if (json.material && typeof json.material === 'string') {
    materials[json.material] = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
  }

  return {
    geometries: {},
    materials,
    textures: {},
    images: {},
  };
}

export function createEmitHelper(config: ParticleEmitterConfig): THREE.LineSegments | null {
  if (!config.showHelper) return null;

  const [sx, sy, sz] = config.emitSize;
  const geo =
    config.emitShape === 'sphere'
      ? new THREE.WireframeGeometry(
          new THREE.SphereGeometry(Math.max(sx, sy, sz) * 0.5, 12, 8)
        )
      : new THREE.EdgesGeometry(new THREE.BoxGeometry(sx, sy, sz));

  const helper = new THREE.LineSegments(
    geo,
    new THREE.LineBasicMaterial({ color: 0x66aaff, transparent: true, opacity: 0.45 })
  );
  helper.name = 'particle_emit_helper';
  helper.userData.isEditorHelper = true;
  helper.raycast = () => {};
  return helper;
}

export function disposeQuarksSystem(system: ParticleSystem, batchedRenderer: BatchedRenderer) {
  batchedRenderer.deleteSystem(system);
  system.emitter.parent?.remove(system.emitter);
  system.dispose?.();
}

let batchedRenderer: BatchedRenderer | null = null;

export function ensureQuarksBatchedRenderer(scene: THREE.Scene): BatchedRenderer {
  if (batchedRenderer && batchedRenderer.parent === scene) {
    return batchedRenderer;
  }

  if (batchedRenderer?.parent) {
    batchedRenderer.parent.remove(batchedRenderer);
  }

  batchedRenderer = new BatchedRenderer();
  batchedRenderer.name = 'quarks_batched_renderer';
  batchedRenderer.userData.isEditorHelper = true;
  batchedRenderer.frustumCulled = false;
  scene.add(batchedRenderer);
  (window as unknown as { __quarksBatchedRenderer?: BatchedRenderer }).__quarksBatchedRenderer =
    batchedRenderer;
  return batchedRenderer;
}

export function getQuarksBatchedRenderer(): BatchedRenderer | null {
  return batchedRenderer;
}

export function disposeQuarksBatchedRenderer() {
  if (batchedRenderer?.parent) {
    batchedRenderer.parent.remove(batchedRenderer);
  }
  batchedRenderer = null;
}

export function tickQuarksBatchedRenderer(delta: number) {
  batchedRenderer?.update(delta);
}

export function parseCustomParticleJson(
  jsonText: string
): { kind: 'config'; config: Partial<ParticleEmitterConfig> } | { kind: 'quarks'; json: string } | null {
  try {
    const parsed = JSON.parse(jsonText) as Record<string, unknown>;

    if (parsed.version && parsed.shape) {
      return { kind: 'quarks', json: jsonText };
    }

    if (typeof parsed.emissionRate === 'number' || typeof parsed.preset === 'string') {
      return { kind: 'config', config: parsed as Partial<ParticleEmitterConfig> };
    }

    return null;
  } catch {
    return null;
  }
}

export function exportParticleConfigJson(config: ParticleEmitterConfig): string {
  return JSON.stringify(config, null, 2);
}

/** 根据预设返回建议的初始位置 */
export function getParticleSpawnTransform(presetId: ParticlePresetId): [number, number, number] {
  switch (presetId) {
    case 'rain':
    case 'confetti':
      return [0, 14, 0];
    case 'snow':
      return [0, 12, 0];
    case 'mist':
      return [0, 0.3, 0];
    default:
      return [0, 1.2, 0];
  }
}
