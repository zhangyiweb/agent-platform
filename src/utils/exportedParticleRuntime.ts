/** 导出项目包中的 particleRuntime.js（基于 three.quarks） */
export function buildParticleRuntimeJs(): string {
  return `import * as THREE from 'three';
import {
  BatchedRenderer,
  ParticleSystem,
  SphereEmitter,
  ConeEmitter,
  PointEmitter,
  RectangleEmitter,
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
} from 'three.quarks';

function hexToVec3(hex) {
  const c = new THREE.Color(hex);
  return new THREE.Vector3(c.r, c.g, c.b);
}

function createShape(cfg) {
  const [sx, sy, sz] = cfg.emitSize || [0.5, 0.5, 0.5];
  if (cfg.emitShape === 'sphere') {
    return new SphereEmitter({ radius: Math.max(sx, sy, sz) * 0.5, thickness: 1 });
  }
  if (cfg.emitShape === 'cone') {
    return new ConeEmitter({ radius: Math.max(sx, sz) * 0.5, angle: Math.max(0.05, cfg.spread || 0.5) });
  }
  if (cfg.emitShape === 'box') {
    return new RectangleEmitter({ width: sx, height: sz, thickness: 1 });
  }
  return new PointEmitter();
}

function buildSystem(cfg) {
  const mat = new THREE.MeshBasicMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: cfg.blendMode === 'additive' ? THREE.AdditiveBlending : THREE.NormalBlending,
  });

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

  return new ParticleSystem({
    duration: cfg.duration > 0 ? cfg.duration : 5,
    looping: cfg.loop !== false,
    shape: createShape(cfg),
    startLife: new IntervalValue(cfg.lifetimeMin, cfg.lifetimeMax),
    startSpeed: new IntervalValue(cfg.speedMin, cfg.speedMax),
    startSize: new ConstantValue(1),
    startColor: new ConstantColor(new THREE.Vector4(1, 1, 1, cfg.opacityStart)),
    emissionOverTime: new ConstantValue(cfg.enabled !== false ? cfg.emissionRate : 0),
    worldSpace: false,
    softParticles: true,
    material: mat,
    behaviors,
  });
}

export function createParticleEmitters(scene, editorObjects, particlesConfig) {
  const batched = new BatchedRenderer();
  batched.name = 'quarks_batched_renderer';
  scene.add(batched);

  const systems = [];
  const objects = (editorObjects || []).filter((o) => o.type === 'particle');

  objects.forEach((obj) => {
    const cfg = particlesConfig[obj.id];
    if (!cfg) return;
    const system = buildSystem(cfg);
    const g = new THREE.Group();
    g.position.set(obj.position[0], obj.position[1], obj.position[2]);
    g.rotation.set(obj.rotation[0], obj.rotation[1], obj.rotation[2]);
    g.scale.set(obj.scale[0], obj.scale[1], obj.scale[2]);
    g.visible = obj.visible !== false;
    g.add(system.emitter);
    scene.add(g);
    batched.addSystem(system);
    systems.push({ batched, system, config: cfg });
  });

  return systems;
}

export function tickParticleEmitters(systems, delta) {
  if (!systems.length) return;
  systems[0].batched.update(delta);
}
`;
}
