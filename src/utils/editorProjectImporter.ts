import JSZip from 'jszip';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import type { ExportedSceneConfig } from '@/utils/sceneConfigExporter';
import type { SceneObject } from '@/types/scene';
import type { LightConfig } from '@/types/light';
import type { CameraTour } from '@/types/cameraTour';
import type { TextureUvAnimationConfig } from '@/types/textureAnimation';
import type { ParticleEmitterConfig } from '@/types/particle';
import { restoreParticleEmitters } from '@/utils/particleScene';
import { createLabelAnchor } from '@/utils/sceneLabel';
import { createDefaultLabelConfig, resolveLabelScale } from '@/types/sceneLabel';
import type { ExportedTextureUvState } from '@/utils/textureUvUtils';
import { clearEditorScene } from '@/utils/clearEditorScene';
import { restoreEditorObjectIds } from '@/utils/exportSceneRestore';
import { applyTextureUvStates, normalizeObjectTextureUvs } from '@/utils/textureUvUtils';
import { enableMeshShadows } from '@/config/defaultLighting';
import { findThreeObjectById, syncSceneObjectsToStore } from '@/utils/sceneUtils';
import { useSceneStore } from '@/store/sceneStore';
import { useLightStore } from '@/store/lightStore';
import { useAnimationStore } from '@/store/animationStore';
import { useTourStore } from '@/store/tourStore';
import { applyHdrRotationY as applySceneHdrRotationY } from '@/utils/hdrRotation';

export const EDITOR_PROJECT_RESTORE_EVENT = 'editor:project-restored';

type ProjectConfig = ExportedSceneConfig & {
  format?: string;
  assets?: {
    model?: string;
    hdr?: string;
    textures?: Array<{ path: string; sourceUrl: string }>;
  };
  editor: ExportedSceneConfig['editor'] & {
    textureUvStates?: Record<string, ExportedTextureUvState>;
    cameraTours?: CameraTour[];
    activeCameraTourId?: string | null;
    textureUvAnimations?: Record<string, TextureUvAnimationConfig>;
    particles?: Record<string, ParticleEmitterConfig>;
  };
};

const TONE_MAPPING_BY_NAME: Record<string, THREE.ToneMapping> = {
  none: THREE.NoToneMapping,
  linear: THREE.LinearToneMapping,
  reinhard: THREE.ReinhardToneMapping,
  cineon: THREE.CineonToneMapping,
  aces: THREE.ACESFilmicToneMapping,
  agx: THREE.AgXToneMapping,
  neutral: THREE.NeutralToneMapping,
};

function createGltfLoader() {
  const loader = new GLTFLoader();
  const dracoLoader = new DRACOLoader();
  dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
  loader.setDRACOLoader(dracoLoader);
  return loader;
}

function findSceneJsonPath(zip: JSZip): string | null {
  const paths = Object.keys(zip.files).filter((p) => !zip.files[p].dir);
  const preferred = paths.find((p) => p.endsWith('config/scene.json'));
  if (preferred) return preferred;
  const fallback = paths.find((p) => /(^|\/)scene\.json$/i.test(p));
  return fallback ?? null;
}

function getZipRootPrefix(sceneJsonPath: string): string {
  const idx = sceneJsonPath.indexOf('config/scene.json');
  return idx >= 0 ? sceneJsonPath.slice(0, idx) : '';
}

async function loadGlbFromZip(
  zip: JSZip,
  rootPrefix: string,
  modelPath: string
): Promise<THREE.Group | null> {
  const fullPath = `${rootPrefix}${modelPath}`.replace(/\/+/g, '/');
  const file = zip.file(fullPath) ?? zip.file(modelPath);
  if (!file) return null;

  const buffer = await file.async('arraybuffer');
  const loader = createGltfLoader();
  const gltf = await loader.parseAsync(buffer, '');
  return gltf.scene;
}

async function loadHdrFromZip(
  zip: JSZip,
  rootPrefix: string,
  hdrPath: string
): Promise<THREE.Texture | null> {
  const fullPath = `${rootPrefix}${hdrPath}`.replace(/\/+/g, '/');
  const file = zip.file(fullPath) ?? zip.file(hdrPath);
  if (!file) return null;

  const blob = await file.async('blob');
  const url = URL.createObjectURL(blob);
  const loader = new HDRLoader();
  try {
    const texture = await loader.loadAsync(url);
    texture.mapping = THREE.EquirectangularReflectionMapping;
    return texture;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** GLB 导出时已烘焙变换，导入后只同步 store，避免重复 apply 导致位移 */
function syncStoreFromLoadedObjects() {
  const scene = (window as any).__editorScene as THREE.Scene | undefined;
  if (!scene) return;
  syncSceneObjectsToStore(scene);
}

/** 将 GLB 子节点挂回场景根级，还原编辑时的层级（保持世界坐标） */
function attachLoadedModelToScene(scene: THREE.Scene, modelRoot: THREE.Group) {
  if (modelRoot.children.length > 0) {
    const children = [...modelRoot.children];
    children.forEach((child) => scene.attach(child));
    return;
  }
  scene.add(modelRoot);
}

function registerEditorObjects(objects: SceneObject[], modelRoot: THREE.Object3D | null) {
  const scene = (window as any).__editorScene as THREE.Scene | undefined;
  if (!scene) return;

  const { addObject, registerThreeObject } = useSceneStore.getState();

  objects.forEach((obj) => {
    const threeObj =
      findThreeObjectById(scene, obj.id, useSceneStore.getState().getThreeObject) ||
      (modelRoot && findThreeObjectById(scene, obj.id));
    if (!threeObj) return;

    registerThreeObject(obj.id, threeObj);
    addObject({ ...obj });
  });
}

function applyRendererAndSceneSettings(config: ProjectConfig) {
  const scene = (window as any).__editorScene as THREE.Scene | undefined;
  const renderer = (window as any).__editorRenderer as THREE.WebGLRenderer | undefined;
  const camera = (window as any).__editorCamera as THREE.PerspectiveCamera | undefined;
  const controls = (window as any).__editorControls as {
    target: THREE.Vector3;
    update?: () => void;
  } | undefined;

  const settings = (config.editor.settings ?? {}) as Record<string, unknown>;
  const bgColor = String(settings.bgColor ?? '#1a1a1a');

  if (scene) {
    if (config.scene?.fog?.enabled) {
      scene.fog = new THREE.Fog(
        config.scene.fog.color,
        config.scene.fog.near,
        config.scene.fog.far
      );
    } else {
      scene.fog = null;
    }

    if (!settings.hasHDRBackground && !settings.bgHdriEnabled) {
      scene.background = new THREE.Color(bgColor);
    }
  }

  const cameraPos = settings.cameraPosition as { x: number; y: number; z: number } | undefined;
  const controlsTarget = settings.controlsTarget as { x: number; y: number; z: number } | undefined;
  const camFromConfig = config.camera;

  if (camera) {
    if (cameraPos) {
      camera.position.set(cameraPos.x, cameraPos.y, cameraPos.z);
    } else if (camFromConfig?.position) {
      camera.position.set(camFromConfig.position.x, camFromConfig.position.y, camFromConfig.position.z);
    }

    if (settings.cameraFov != null) camera.fov = Number(settings.cameraFov);
    else if (camFromConfig?.fov) camera.fov = camFromConfig.fov;

    if (settings.cameraNear != null) camera.near = Number(settings.cameraNear);
    else if (camFromConfig?.near) camera.near = camFromConfig.near;

    if (settings.cameraFar != null) camera.far = Number(settings.cameraFar);
    else if (camFromConfig?.far) camera.far = camFromConfig.far;

    camera.updateProjectionMatrix();
  }

  if (controls) {
    if (controlsTarget) {
      controls.target.set(controlsTarget.x, controlsTarget.y, controlsTarget.z);
    } else if (config.controls?.target) {
      controls.target.set(config.controls.target.x, config.controls.target.y, config.controls.target.z);
    }
    controls.update?.();
  }

  if (renderer && config.renderer) {
    const tone = TONE_MAPPING_BY_NAME[config.renderer.toneMapping] ?? THREE.ACESFilmicToneMapping;
    renderer.toneMapping = tone;
    renderer.toneMappingExposure = config.renderer.toneMappingExposure;
    renderer.shadowMap.enabled = config.renderer.shadowMapEnabled;
    if (settings.pixelRatio != null) {
      const ratio = settings.pixelRatio === 'auto'
        ? window.devicePixelRatio
        : Number(settings.pixelRatio);
      if (!Number.isNaN(ratio)) renderer.setPixelRatio(ratio);
    }
  }

  if (config.postProcess) {
    (window as any).__postProcessConfig = config.postProcess;
  }

  const mergedSettings = {
    ...settings,
    postProcess: config.postProcess ?? undefined,
    postProcessEnabled: config.postProcess?.enabled ?? false,
    selectedEffect: config.postProcess?.effect ?? 'none',
    presetId: config.postProcess?.presetId,
    ...(config.postProcess?.params ?? {}),
  };
  (window as any).__globalSettingsState = mergedSettings;
}

function dispatchProjectRestoredEvent(config: ProjectConfig) {
  window.dispatchEvent(
    new CustomEvent(EDITOR_PROJECT_RESTORE_EVENT, { detail: { config } })
  );
}

async function applyHdrEnvironment(
  config: ProjectConfig,
  zip: JSZip | null,
  rootPrefix: string
) {
  const scene = (window as any).__editorScene as THREE.Scene | undefined;
  if (!scene || !config.assets?.hdr || !zip) return;

  const texture = await loadHdrFromZip(zip, rootPrefix, config.assets.hdr);
  if (!texture) return;

  const settings = (config.editor.settings ?? {}) as Record<string, unknown>;
  const rotationY = Number(settings.hdrRotationY ?? config.scene.environment.rotationY ?? 0);
  const envIntensity = Number(settings.envMapIntensity ?? config.scene.environment.intensity ?? 1);

  const useBackground = Boolean(settings.bgHdriEnabled ?? settings.hasHDRBackground);
  const useEnvironment = Boolean(
    settings.envHdriEnabled ?? settings.hasHDREnvironment ?? config.scene.environment.enabled
  );

  if (useBackground) {
    scene.background = texture;
  }
  if (useEnvironment) {
    scene.environment = texture;
    scene.environmentIntensity = envIntensity;
  }

  applySceneHdrRotationY(scene, rotationY);

  // 供 GlobalSettings 恢复内部 HDR 缓存
  (window as any).__hdrTextureCache = texture;

  const fullPath = `${rootPrefix}${config.assets.hdr}`.replace(/\/+/g, '/');
  const zipFile = zip.file(fullPath) ?? zip.file(config.assets.hdr);
  if (zipFile) {
    const blob = await zipFile.async('blob');
    const filename = config.assets.hdr.split('/').pop() || 'environment.hdr';
    (window as any).__hdrExportSource = {
      kind: 'file',
      file: new File([blob], filename),
    };
  }

  // 回写全局状态，确保 UI 开关与场景一致
  const prev = ((window as any).__globalSettingsState ?? {}) as Record<string, unknown>;
  (window as any).__globalSettingsState = {
    ...prev,
    hasHDRBackground: useBackground,
    hasHDREnvironment: useEnvironment,
    bgHdriEnabled: useBackground,
    envHdriEnabled: useEnvironment,
    hdriReady: true,
    hdrBgName: String(settings.hdrBgName ?? filenameFromHdrPath(config.assets.hdr)),
    hdrEnvName: String(settings.hdrEnvName ?? filenameFromHdrPath(config.assets.hdr)),
  };
}

function filenameFromHdrPath(hdrPath: string): string {
  return hdrPath.split('/').pop() || 'environment.hdr';
}

async function restoreProjectConfig(
  config: ProjectConfig,
  zip: JSZip | null,
  rootPrefix: string
) {
  clearEditorScene();

  const editorObjects = config.editor.objects ?? [];
  const editorLights = (config.editor.lights ?? []) as LightConfig[];
  const textureUvStates = config.editor.textureUvStates ?? {};
  const textureUvAnimations = config.editor.textureUvAnimations ?? {};
  const particles = config.editor.particles ?? {};
  const cameraTours = config.editor.cameraTours ?? [];
  const activeCameraTourId = config.editor.activeCameraTourId ?? null;

  useLightStore.getState().replaceLights(editorLights);
  useTourStore.getState().loadTours(cameraTours, activeCameraTourId);
  useAnimationStore.setState({ textureUvAnimations });

  const scene = (window as any).__editorScene as THREE.Scene | undefined;
  if (!scene) {
    throw new Error('场景尚未初始化');
  }

  let modelRoot: THREE.Group | null = null;
  if (config.assets?.model && zip) {
    modelRoot = await loadGlbFromZip(zip, rootPrefix, config.assets.model);
    if (modelRoot) {
      normalizeObjectTextureUvs(modelRoot);
      restoreEditorObjectIds(modelRoot, editorObjects);
      enableMeshShadows(modelRoot);
      attachLoadedModelToScene(scene, modelRoot);
    }
  }

  registerEditorObjects(
    editorObjects.filter((o) => o.type !== 'particle' && o.type !== 'label'),
    modelRoot
  );
  syncStoreFromLoadedObjects();

  const particleObjects = editorObjects.filter((o) => o.type === 'particle');
  if (particleObjects.length > 0) {
    restoreParticleEmitters(scene, particles, particleObjects);
  }

  const labelObjects = editorObjects.filter((o) => o.type === 'label');
  if (labelObjects.length > 0) {
    const { addObject, registerThreeObject } = useSceneStore.getState();
    labelObjects.forEach((obj) => {
      const cfg = {
        ...createDefaultLabelConfig(obj.label?.mode ?? 'css2d'),
        ...obj.label,
        scale: resolveLabelScale(obj.label),
      };
      const anchor = createLabelAnchor(obj.id, obj.name, cfg);
      anchor.position.set(...obj.position);
      anchor.rotation.set(...obj.rotation);
      anchor.scale.set(...obj.scale);
      anchor.visible = obj.visible;
      scene.add(anchor);
      registerThreeObject(obj.id, anchor);
      addObject({ ...obj, label: cfg });
    });
  }

  if (Object.keys(textureUvStates).length > 0) {
    applyTextureUvStates(
      scene,
      scene,
      textureUvStates,
      useSceneStore.getState().getThreeObject
    );
  }

  applyRendererAndSceneSettings(config);
  await applyHdrEnvironment(config, zip, rootPrefix);
  dispatchProjectRestoredEvent(config);
}

function parseProjectConfig(raw: unknown): ProjectConfig {
  if (!raw || typeof raw !== 'object') {
    throw new Error('无效的项目配置文件');
  }
  const config = raw as ProjectConfig;
  if (!config.editor) {
    throw new Error('配置文件缺少 editor 节点');
  }
  return config;
}

/** 从 ZIP 项目包导入（编辑器保存包或导出的完整项目包均可） */
export async function importEditorProjectZip(file: File): Promise<void> {
  const zip = await JSZip.loadAsync(file);
  const sceneJsonPath = findSceneJsonPath(zip);
  if (!sceneJsonPath) {
    throw new Error('ZIP 中未找到 config/scene.json');
  }

  const jsonText = await zip.file(sceneJsonPath)!.async('text');
  const config = parseProjectConfig(JSON.parse(jsonText));
  const rootPrefix = getZipRootPrefix(sceneJsonPath);

  await restoreProjectConfig(config, zip, rootPrefix);
}

/** 从独立 scene-config JSON 导入（仅恢复配置，不含模型） */
export async function importEditorProjectJson(file: File): Promise<void> {
  const text = await file.text();
  const config = parseProjectConfig(JSON.parse(text));
  await restoreProjectConfig(config, null, '');
}

/** 当前场景是否已有可保存的内容 */
export function hasEditorSceneContent(): boolean {
  const scene = (window as any).__editorScene as THREE.Scene | undefined;
  if (!scene) return false;

  const { objects } = useSceneStore.getState();
  const { lights } = useLightStore.getState();

  if (objects.length > 0) return true;
  if (lights.length > 0) return true;

  return scene.children.some((child) => {
    if (child.name === 'grid' || child.name === 'axes') return false;
    if (child.type === 'TransformControlsGizmo') return false;
    if (child.name.startsWith('helper_')) return false;
    return true;
  });
}
