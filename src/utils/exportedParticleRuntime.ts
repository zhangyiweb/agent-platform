/** 导出项目包中的 particleRuntime.js（与编辑器 quarksAdapter 行为对齐） */
export function buildParticleRuntimeJs(): string {
  return `import * as THREE from 'three';
import {
  BatchedRenderer,
  ParticleSystem,
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
} from 'three.quarks';

const EMIT_AXIS = new THREE.Vector3(0, 0, 1);
const _dir = new THREE.Vector3();
const _quat = new THREE.Quaternion();

const FALLING_WEATHER_PRESETS = new Set(['confetti']);

function hexToVec3(hex) {
  const c = new THREE.Color(hex);
  return new THREE.Vector3(c.r, c.g, c.b);
}

function isFallingWeather(cfg) {
  return FALLING_WEATHER_PRESETS.has(cfg.preset);
}

function createCanvas(size) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  return [canvas, canvas.getContext('2d')];
}

function buildSoftTexture() {
  const [canvas, ctx] = createCanvas(128);
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.6)');
  g.addColorStop(0.7, 'rgba(255,255,255,0.15)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function buildSmokeTexture() {
  const [canvas, ctx] = createCanvas(256);
  ctx.clearRect(0, 0, 256, 256);
  const blobs = [
    { x: 128, y: 120, r: 72, a: 0.55 },
    { x: 100, y: 140, r: 48, a: 0.35 },
    { x: 155, y: 135, r: 52, a: 0.4 },
    { x: 128, y: 95, r: 40, a: 0.3 },
    { x: 85, y: 105, r: 35, a: 0.25 },
    { x: 168, y: 108, r: 38, a: 0.28 },
  ];
  blobs.forEach(({ x, y, r, a }) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, \`rgba(255,255,255,\${a})\`);
    g.addColorStop(0.5, \`rgba(255,255,255,\${a * 0.4})\`);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
  });
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function buildSparkTexture() {
  const [canvas, ctx] = createCanvas(128);
  ctx.translate(64, 64);
  const drawRay = (angle, len, width, alpha) => {
    ctx.save();
    ctx.rotate(angle);
    const g = ctx.createLinearGradient(0, 0, len, 0);
    g.addColorStop(0, \`rgba(255,255,255,\${alpha})\`);
    g.addColorStop(0.35, \`rgba(255,245,200,\${alpha * 0.85})\`);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, -width / 2, len, width);
    ctx.restore();
  };
  const core = ctx.createRadialGradient(0, 0, 0, 0, 0, 24);
  core.addColorStop(0, 'rgba(255,255,255,1)');
  core.addColorStop(0.35, 'rgba(255,230,140,0.95)');
  core.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(0, 0, 24, 0, Math.PI * 2);
  ctx.fill();
  for (let i = 0; i < 8; i++) drawRay((Math.PI * 2 * i) / 8, 58, 4.5, 1);
  for (let i = 0; i < 8; i++) drawRay((Math.PI * 2 * i) / 8 + Math.PI / 8, 38, 2.5, 0.75);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

const builtinTextureCache = new Map();

function getBuiltinTexture(kind) {
  const key = kind === 'custom' ? 'soft' : kind;
  if (builtinTextureCache.has(key)) return builtinTextureCache.get(key);
  let tex;
  if (key === 'smoke') tex = buildSmokeTexture();
  else if (key === 'spark') tex = buildSparkTexture();
  else tex = buildSoftTexture();
  builtinTextureCache.set(key, tex);
  return tex;
}

function resolveParticleTexture(cfg) {
  if (cfg.texture === 'custom' && cfg.customTextureUrl) {
    const loader = new THREE.TextureLoader();
    const tex = loader.load(cfg.customTextureUrl);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }
  return getBuiltinTexture(cfg.texture);
}

function createEmitterShape(cfg) {
  const [sx, , sz] = cfg.emitSize || [0.5, 0.5, 0.5];
  switch (cfg.emitShape) {
    case 'sphere': {
      const radius = Math.max(sx, sz, 0.1) * 0.5;
      return new SphereEmitter({ radius, thickness: 1 });
    }
    case 'cone': {
      const radius = Math.max(sx, sz, 0.1) * 0.5;
      return new ConeEmitter({ radius, angle: Math.max(0.05, cfg.spread || 0.5) });
    }
    case 'box': {
      const width = Math.max(sx, 0.5);
      const depth = Math.max(sz, 0.5);
      return new GridEmitter({
        width,
        height: depth,
        column: Math.max(16, Math.round(width * 2)),
        row: Math.max(16, Math.round(depth * 2)),
      });
    }
    default:
      return new PointEmitter();
  }
}

function alignEmitterDirection(emitter, direction) {
  _dir.set(direction[0], direction[1], direction[2]);
  if (_dir.lengthSq() < 1e-6) return;
  _dir.normalize();
  _quat.setFromUnitVectors(EMIT_AXIS, _dir);
  emitter.quaternion.copy(_quat);
}

function applyEmitterLayout(emitter, cfg) {
  emitter.rotation.set(0, 0, 0);
  if (isFallingWeather(cfg)) {
    alignEmitterDirection(emitter, [0, -1, 0]);
    return;
  }
  alignEmitterDirection(emitter, cfg.direction || [0, 1, 0]);
}

function buildBehaviors(cfg) {
  const behaviors = [
    new SizeOverLife(
      new PiecewiseBezier([[new Bezier(cfg.sizeStart, cfg.sizeStart, cfg.sizeEnd, cfg.sizeEnd), 0]])
    ),
    new ColorOverLife(
      new Gradient(
        [[hexToVec3(cfg.colorStart), 0], [hexToVec3(cfg.colorEnd), 1]],
        [[cfg.opacityStart, 0], [cfg.opacityEnd, 1]]
      )
    ),
    new ApplyForce(
      new THREE.Vector3(cfg.gravity[0], cfg.gravity[1], cfg.gravity[2]),
      new ConstantValue(1)
    ),
  ];

  if ((cfg.turbulence || 0) > 0.01) {
    behaviors.push(
      new TurbulenceField(
        new THREE.Vector3(2, 2, 2),
        cfg.turbulence,
        new THREE.Vector3(1, 2, 1),
        new THREE.Vector3(0.08, 0.08, 0.08)
      )
    );
  }

  if (Math.abs(cfg.rotationSpeed || 0) > 0.01) {
    behaviors.push(
      new RotationOverLife(new IntervalValue(-cfg.rotationSpeed, cfg.rotationSpeed))
    );
  }

  return behaviors;
}

function buildMinimalMetaFromJson(json) {
  const materials = {};
  if (json.material && typeof json.material === 'string') {
    materials[json.material] = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
  }
  return { geometries: {}, materials, textures: {}, images: {} };
}

function tryBuildFromCustomJson(jsonText) {
  try {
    const parsed = JSON.parse(jsonText);
    if (parsed.version && parsed.shape) {
      const meta = buildMinimalMetaFromJson(parsed);
      return ParticleSystem.fromJSON(parsed, meta, {});
    }
  } catch {
    /* ignore */
  }
  return null;
}

function buildSystem(cfg) {
  if (cfg.customQuarksJson) {
    const fromCustom = tryBuildFromCustomJson(cfg.customQuarksJson);
    if (fromCustom) return fromCustom;
  }

  const material = new THREE.MeshBasicMaterial({
    map: resolveParticleTexture(cfg),
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: cfg.blendMode === 'additive' ? THREE.AdditiveBlending : THREE.NormalBlending,
  });

  const fallingWeather = isFallingWeather(cfg);
  const system = new ParticleSystem({
    duration: cfg.duration > 0 ? cfg.duration : 30,
    looping: cfg.loop !== false,
    prewarm: true,
    shape: createEmitterShape(cfg),
    startLife: new IntervalValue(cfg.lifetimeMin, cfg.lifetimeMax),
    startSpeed: new IntervalValue(cfg.speedMin, cfg.speedMax),
    startSize: new ConstantValue(Math.max(cfg.sizeStart, 0.02)),
    startColor: new ConstantColor(new THREE.Vector4(1, 1, 1, cfg.opacityStart)),
    emissionOverTime: new ConstantValue(cfg.enabled !== false ? cfg.emissionRate : 0),
    worldSpace: fallingWeather,
    softParticles: false,
    renderMode: RenderMode.BillBoard,
    rendererEmitterSettings: {},
    material,
    behaviors: buildBehaviors(cfg),
  });

  applyEmitterLayout(system.emitter, cfg);
  system.restart();
  return system;
}

export function createParticleEmitters(scene, editorObjects, particlesConfig) {
  const batched = new BatchedRenderer();
  batched.name = 'quarks_batched_renderer';
  batched.frustumCulled = false;
  scene.add(batched);

  const systems = [];
  const objects = (editorObjects || []).filter((o) => o.type === 'particle');

  objects.forEach((obj) => {
    const cfg = particlesConfig[obj.id];
    if (!cfg) return;

    const system = buildSystem(cfg);
    const root = new THREE.Group();
    root.name = obj.name || '粒子发射器';
    root.position.set(obj.position[0], obj.position[1], obj.position[2]);
    root.rotation.set(obj.rotation[0], obj.rotation[1], obj.rotation[2]);
    root.scale.set(obj.scale[0], obj.scale[1], obj.scale[2]);
    root.visible = obj.visible !== false && cfg.enabled !== false;
    root.add(system.emitter);
    scene.add(root);
    batched.addSystem(system);
    system.play();
    systems.push({ batched, system, root, config: cfg });
  });

  return systems;
}

export function tickParticleEmitters(systems, delta) {
  if (!systems.length || delta <= 0) return;
  systems[0].batched.update(delta);
}
`;
}
