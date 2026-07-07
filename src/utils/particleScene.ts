import * as THREE from 'three';
import type { ParticleEmitterConfig } from '@/types/particle';
import { DEFAULT_PARTICLE_CONFIG } from '@/types/particle';
import { getPresetConfig } from '@/particles/particlePresets';
import {
  buildQuarksParticleSystem,
  createEmitHelper,
  disposeQuarksBatchedRenderer,
  disposeQuarksSystem,
  ensureQuarksBatchedRenderer,
  getQuarksBatchedRenderer,
  tickQuarksBatchedRenderer,
  type QuarksParticleEntry,
} from '@/particles/quarksAdapter';
import { useParticleStore } from '@/store/particleStore';
import { useSceneStore } from '@/store/sceneStore';

const entries = new Map<string, QuarksParticleEntry>();

type EditorTransformControls = {
  object: THREE.Object3D | null;
  detach: () => void;
  attach: (object: THREE.Object3D) => void;
};

function getEditorTransformControls(): EditorTransformControls | undefined {
  return (window as unknown as { __editorTransformControls?: EditorTransformControls })
    .__editorTransformControls;
}

function isTransformControlsAttachedToObject(
  tc: EditorTransformControls,
  objectId: string,
  root?: THREE.Object3D
) {
  const attached = tc.object;
  if (!attached) return false;
  if (root && attached === root) return true;
  if (attached.userData?.id === objectId) return true;
  return attached.parent?.userData?.id === objectId;
}

function detachTransformControlsIfAttached(objectId: string, root?: THREE.Object3D) {
  const tc = getEditorTransformControls();
  if (!tc) return false;
  if (!isTransformControlsAttachedToObject(tc, objectId, root)) return false;
  tc.detach();
  return true;
}

function attachTransformControlsIfSelected(objectId: string, root: THREE.Object3D) {
  const tc = getEditorTransformControls();
  if (!tc || !root.parent) return;
  if (useSceneStore.getState().selectedIds[0] !== objectId) return;
  tc.attach(root);
}

export function getParticleSystem(id: string): QuarksParticleEntry | undefined {
  return entries.get(id);
}

function resolveParticleRootVisible(id: string, config?: ParticleEmitterConfig): boolean {
  const cfg = config ?? useParticleStore.getState().emitters[id];
  const sceneObj = useSceneStore.getState().objects.find((o) => o.id === id);
  return (sceneObj?.visible !== false) && (cfg?.enabled !== false);
}

/** 同步粒子根节点显隐（场景可见 × 发射器启用） */
export function syncParticleRootVisibility(id: string) {
  const entry = entries.get(id);
  if (!entry) return;
  entry.root.visible = resolveParticleRootVisible(id);
}


function applyTransform(
  root: THREE.Object3D,
  transform?: {
    position?: [number, number, number];
    rotation?: [number, number, number];
    scale?: [number, number, number];
  }
) {
  if (transform?.position) root.position.set(...transform.position);
  if (transform?.rotation) root.rotation.set(...transform.rotation);
  if (transform?.scale) root.scale.set(...transform.scale);
}

function mountQuarksEntry(
  scene: THREE.Scene,
  id: string,
  name: string,
  config: ParticleEmitterConfig,
  transform?: {
    position?: [number, number, number];
    rotation?: [number, number, number];
    scale?: [number, number, number];
  }
): THREE.Object3D {
  const batched = ensureQuarksBatchedRenderer(scene);
  const system = buildQuarksParticleSystem(config);
  const root = system.emitter;

  root.name = name;
  root.userData.id = id;
  root.userData.isParticleEmitter = true;

  applyTransform(root, transform);

  const helper = createEmitHelper(config);
  if (helper) root.add(helper);

  ensureParticlePickProxy(root, id);

  scene.add(root);
  batched.addSystem(system);
  system.play();

  entries.set(id, { system, root, helper });
  return root;
}

function rebuildQuarksEntry(id: string, config: ParticleEmitterConfig) {
  const entry = entries.get(id);
  const scene = (window as unknown as { __editorScene?: THREE.Scene }).__editorScene;
  if (!entry || !scene) return;

  const batched = ensureQuarksBatchedRenderer(scene);
  const { root, helper } = entry;
  const worldPos = root.position.clone();
  const worldQuat = root.quaternion.clone();
  const worldScale = root.scale.clone();
  const wasTransformAttached = detachTransformControlsIfAttached(id, root);

  disposeQuarksSystem(entry.system, batched);

  if (helper) {
    root.remove(helper);
    helper.geometry.dispose();
    (helper.material as THREE.Material).dispose();
  }

  const system = buildQuarksParticleSystem(config);
  const newRoot = system.emitter;
  newRoot.name = root.name;
  newRoot.userData.id = id;
  newRoot.userData.isParticleEmitter = true;
  newRoot.position.copy(worldPos);
  newRoot.quaternion.copy(worldQuat);
  newRoot.scale.copy(worldScale);
  newRoot.visible = resolveParticleRootVisible(id, config);

  const newHelper = createEmitHelper(config);
  if (newHelper) newRoot.add(newHelper);

  ensureParticlePickProxy(newRoot, id);

  scene.add(newRoot);
  root.parent?.remove(root);
  batched.addSystem(system);
  system.play();

  entries.set(id, { system, root: newRoot, helper: newHelper });
  useSceneStore.getState().registerThreeObject(id, newRoot);
  if (wasTransformAttached) {
    attachTransformControlsIfSelected(id, newRoot);
  }
}

export function createParticleEmitter(
  scene: THREE.Scene,
  id: string,
  name: string,
  config?: Partial<ParticleEmitterConfig>,
  transform?: {
    position?: [number, number, number];
    rotation?: [number, number, number];
    scale?: [number, number, number];
  }
): THREE.Object3D {
  const baseConfig = config?.preset
    ? getPresetConfig(config.preset)
    : DEFAULT_PARTICLE_CONFIG;
  const fullConfig: ParticleEmitterConfig = {
    ...baseConfig,
    ...config,
  };

  const root = mountQuarksEntry(scene, id, name, fullConfig, transform);
  useParticleStore.getState().setEmitter(id, fullConfig);
  return root;
}

function ensureParticlePickProxy(root: THREE.Object3D, id: string) {
  if (root.getObjectByName('particle_pick_proxy')) return;

  const proxy = new THREE.Mesh(
    new THREE.SphereGeometry(0.35, 8, 8),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
  );
  proxy.name = 'particle_pick_proxy';
  proxy.userData.particleId = id;
  proxy.userData.isParticlePickProxy = true;
  root.add(proxy);
}

export function syncParticleConfig(id: string, config: ParticleEmitterConfig) {
  rebuildQuarksEntry(id, config);
  useParticleStore.getState().setEmitter(id, config);
}

export function disposeParticleSystem(id: string) {
  const entry = entries.get(id);
  const batched = getQuarksBatchedRenderer();

  if (entry && batched) {
    detachTransformControlsIfAttached(id, entry.root);

    disposeQuarksSystem(entry.system, batched);
    if (entry.helper) {
      entry.helper.geometry.dispose();
      (entry.helper.material as THREE.Material).dispose();
    }
    entry.root.parent?.remove(entry.root);
  }

  entries.delete(id);
  useParticleStore.getState().removeEmitter(id);
}

export function disposeAllParticleSystems() {
  const batched = getQuarksBatchedRenderer();
  entries.forEach((entry) => {
    if (batched) disposeQuarksSystem(entry.system, batched);
    if (entry.helper) {
      entry.helper.geometry.dispose();
      (entry.helper.material as THREE.Material).dispose();
    }
    entry.root.parent?.remove(entry.root);
  });
  entries.clear();
  disposeQuarksBatchedRenderer();
  useParticleStore.getState().clearEmitters();
}

export function tickParticleSystems(delta: number) {
  if (delta <= 0) return;

  entries.forEach((entry) => {
    const id = entry.root.userData.id as string;
    entry.root.visible = resolveParticleRootVisible(id);
  });

  tickQuarksBatchedRenderer(delta);
}

export function restoreParticleEmitters(
  scene: THREE.Scene,
  emitters: Record<string, ParticleEmitterConfig>,
  objects: Array<{
    id: string;
    name: string;
    type: string;
    position: [number, number, number];
    rotation: [number, number, number];
    scale: [number, number, number];
    visible?: boolean;
  }>
) {
  disposeAllParticleSystems();

  objects
    .filter((o) => o.type === 'particle')
    .forEach((obj) => {
      const config = emitters[obj.id] ?? getPresetConfig('smoke');
      const root = createParticleEmitter(scene, obj.id, obj.name, config, {
        position: obj.position,
        rotation: obj.rotation,
        scale: obj.scale,
      });
      root.visible = obj.visible !== false;

      useSceneStore.getState().registerThreeObject(obj.id, root);
      useSceneStore.getState().addObject({
        id: obj.id,
        name: obj.name,
        type: 'particle',
        visible: obj.visible !== false,
        position: [...obj.position],
        rotation: [...obj.rotation],
        scale: [...obj.scale],
      });
    });

  useParticleStore.getState().replaceEmitters(emitters);
}
