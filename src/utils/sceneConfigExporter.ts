import * as THREE from 'three';
import { useSceneStore } from '@/store/sceneStore';
import { useLightStore } from '@/store/lightStore';
import { useAnimationStore } from '@/store/animationStore';
import { useParticleStore } from '@/store/particleStore';
import { useTourStore } from '@/store/tourStore';
import type { CameraTour } from '@/types/cameraTour';
import type { ExportedTextureUvState } from '@/utils/exportSceneRestore';
import type { ParticleEmitterConfig } from '@/types/particle';
import { syncSceneObjectsToStore } from '@/utils/sceneUtils';

const TONE_MAPPING_BY_NAME: Record<string, number> = {
  none: THREE.NoToneMapping,
  linear: THREE.LinearToneMapping,
  reinhard: THREE.ReinhardToneMapping,
  cineon: THREE.CineonToneMapping,
  aces: THREE.ACESFilmicToneMapping,
  agx: THREE.AgXToneMapping,
  neutral: THREE.NeutralToneMapping,
};

const TONE_MAPPING_NAME_BY_VALUE = Object.fromEntries(
  Object.entries(TONE_MAPPING_BY_NAME).map(([name, value]) => [value, name])
) as Record<number, string>;

export interface ExportedSceneConfig {
  version: string;
  exportTime: string;
  editor: {
    objects: ReturnType<typeof useSceneStore.getState>['objects'];
    lights: ReturnType<typeof useLightStore.getState>['lights'];
    textureUvAnimations: ReturnType<typeof useAnimationStore.getState>['textureUvAnimations'];
    particles?: Record<string, ParticleEmitterConfig>;
    cameraTours?: CameraTour[];
    activeCameraTourId?: string | null;
    textureUvStates?: Record<string, ExportedTextureUvState>;
    settings: Record<string, unknown> | null;
  };
  scene: {
    background: {
      type: 'color' | 'texture' | 'none';
      value: string | null;
      name?: string;
      rotationY?: number;
    };
    fog: {
      enabled: boolean;
      color: string;
      near: number;
      far: number;
    } | null;
    environment: {
      enabled: boolean;
      name?: string;
      intensity?: number;
      rotationY?: number;
    };
  };
  camera: {
    position: { x: number; y: number; z: number };
    fov: number;
    near: number;
    far: number;
    aspect: number;
  } | null;
  controls: {
    target: { x: number; y: number; z: number };
    enableDamping: boolean;
    dampingFactor: number;
    enableZoom: boolean;
    enableRotate: boolean;
    enablePan: boolean;
    minDistance: number;
    maxDistance: number;
    minPolarAngle: number;
    maxPolarAngle: number;
  } | null;
  renderer: {
    antialias: boolean;
    alpha: boolean;
    logarithmicDepthBuffer: boolean;
    pixelRatio: number;
    pixelRatioSetting: string;
    toneMapping: string;
    toneMappingExposure: number;
    outputColorSpace: string;
    shadowMapEnabled: boolean;
    envMapIntensity: number;
    correctLights: boolean;
  } | null;
  postProcess: {
    enabled: boolean;
    effect: string;
    presetId?: string;
    params: Record<string, unknown>;
  } | null;
  runtimeLights: Array<Record<string, unknown>>;
  metadata: {
    totalSceneChildren: number;
    totalEditorObjects: number;
    totalEditorLights: number;
    totalRuntimeLights: number;
  };
}

function roundNum(n: number, digits = 4) {
  return parseFloat(n.toFixed(digits));
}

function serializeRuntimeLight(child: THREE.Light): Record<string, unknown> | null {
  if (!child.color) return null;

  const lightData: Record<string, unknown> = {
    id: child.userData?.id ?? null,
    type: child.type,
    name: child.name || child.type,
    enabled: child.visible,
    color: `#${child.color.getHexString()}`,
    intensity: child.intensity,
    position: {
      x: roundNum(child.position.x),
      y: roundNum(child.position.y),
      z: roundNum(child.position.z),
    },
  };

  if (child instanceof THREE.DirectionalLight) {
    lightData.castShadow = child.castShadow;
    lightData.shadow = {
      mapSize: {
        width: child.shadow.mapSize.width,
        height: child.shadow.mapSize.height,
      },
      camera: {
        left: child.shadow.camera.left,
        right: child.shadow.camera.right,
        top: child.shadow.camera.top,
        bottom: child.shadow.camera.bottom,
        near: child.shadow.camera.near,
        far: child.shadow.camera.far,
      },
    };
  }

  if (child instanceof THREE.PointLight || child instanceof THREE.SpotLight) {
    lightData.distance = child.distance;
    lightData.decay = child.decay;
  }

  if (child instanceof THREE.SpotLight) {
    lightData.angle = child.angle;
    lightData.penumbra = child.penumbra;
    lightData.target = {
      x: roundNum(child.target.position.x),
      y: roundNum(child.target.position.y),
      z: roundNum(child.target.position.z),
    };
  }

  if (child instanceof THREE.HemisphereLight) {
    lightData.groundColor = `#${child.groundColor.getHexString()}`;
  }

  return lightData;
}

function serializePostProcess(raw: Record<string, unknown> | null | undefined) {
  if (!raw) return null;

  const {
    enabled,
    effect,
    presetId,
    bloom,
    vignette,
    film,
    chromatic,
    pixelate,
    glitch,
    outline,
    bokeh,
    afterimage,
    halftone,
    dotscreen,
    sao,
    ssao,
    pixelated,
  } = raw as Record<string, unknown>;

  return {
    enabled: Boolean(enabled),
    effect: String(effect ?? 'none'),
    presetId: presetId ? String(presetId) : undefined,
    params: {
      bloom,
      vignette,
      film,
      chromatic,
      pixelate,
      glitch,
      outline,
      bokeh,
      afterimage,
      halftone,
      dotscreen,
      sao,
      ssao,
      pixelated,
    },
  };
}

/** 生成可序列化的场景配置 */
export function generateSceneConfig(): ExportedSceneConfig {
  const scene = (window as any).__editorScene as THREE.Scene | undefined;
  const renderer = (window as any).__editorRenderer as THREE.WebGLRenderer | undefined;
  const camera = (window as any).__editorCamera as THREE.PerspectiveCamera | undefined;
  const controls = (window as any).__editorControls as {
    target: THREE.Vector3;
    enableDamping: boolean;
    dampingFactor: number;
    enableZoom: boolean;
    enableRotate: boolean;
    enablePan: boolean;
    minDistance: number;
    maxDistance: number;
    minPolarAngle: number;
    maxPolarAngle: number;
  } | undefined;

  if (!scene) {
    throw new Error('场景尚未初始化，请等待编辑器加载完成后再导出');
  }

  syncSceneObjectsToStore(scene);

  const globalSettings = ((window as any).__globalSettingsState ?? null) as Record<string, unknown> | null;
  const postProcessRaw = (window as any).__postProcessConfig as Record<string, unknown> | undefined;

  const editorObjects = useSceneStore.getState().objects;
  const editorLights = useLightStore.getState().lights;
  const textureUvAnimations = useAnimationStore.getState().textureUvAnimations;
  const particles = useParticleStore.getState().emitters;
  const { tours: cameraTours, activeTourId: activeCameraTourId } = useTourStore.getState();

  const runtimeLights: Array<Record<string, unknown>> = [];
  scene.traverse((child) => {
    if (!(child instanceof THREE.Light)) return;
    if (child.name.startsWith('helper_')) return;
    const data = serializeRuntimeLight(child);
    if (data) runtimeLights.push(data);
  });

  let background: ExportedSceneConfig['scene']['background'] = { type: 'none', value: null };
  if (scene.background instanceof THREE.Color) {
    background = { type: 'color', value: `#${scene.background.getHexString()}` };
  } else if (scene.background instanceof THREE.Texture) {
    background = {
      type: 'texture',
      value: null,
      name: String(globalSettings?.hdrBgName ?? 'HDR Background'),
      rotationY: Number(globalSettings?.hdrRotationY ?? 0),
    };
  }

  const fogFromScene = scene.fog;
  const fog = globalSettings
    ? {
        enabled: Boolean(globalSettings.fogEnabled),
        color: String(globalSettings.fogColor ?? '#ffffff'),
        near: Number(globalSettings.fogNear ?? 1),
        far: Number(globalSettings.fogFar ?? 100),
      }
    : fogFromScene instanceof THREE.Fog
      ? {
          enabled: true,
          color: `#${fogFromScene.color.getHexString()}`,
          near: fogFromScene.near,
          far: fogFromScene.far,
        }
      : null;

  const toneMappingName =
    (globalSettings?.toneMapping as string) ||
    TONE_MAPPING_NAME_BY_VALUE[renderer?.toneMapping ?? THREE.ACESFilmicToneMapping] ||
    'aces';

  return {
    version: '1.2.0',
    exportTime: new Date().toISOString(),
    editor: {
      objects: editorObjects,
      lights: editorLights,
      textureUvAnimations,
      ...(Object.keys(particles).length > 0 ? { particles } : {}),
      ...(cameraTours.length > 0 ? { cameraTours, activeCameraTourId } : {}),
      settings: globalSettings,
    },
    scene: {
      background,
      fog,
      environment: {
        enabled: Boolean(
          scene.environment && globalSettings?.envHdriEnabled !== false
        ),
        name: globalSettings?.hdrEnvName ? String(globalSettings.hdrEnvName) : undefined,
        intensity: globalSettings?.envMapIntensity != null
          ? Number(globalSettings.envMapIntensity)
          : undefined,
        rotationY: Number(globalSettings?.hdrRotationY ?? 0),
      },
    },
    camera: camera
      ? {
          position: {
            x: roundNum(camera.position.x),
            y: roundNum(camera.position.y),
            z: roundNum(camera.position.z),
          },
          fov: camera.fov,
          near: camera.near,
          far: camera.far,
          aspect: roundNum(camera.aspect),
        }
      : null,
    controls: controls
      ? {
          target: {
            x: roundNum(controls.target.x),
            y: roundNum(controls.target.y),
            z: roundNum(controls.target.z),
          },
          enableDamping: controls.enableDamping,
          dampingFactor: controls.dampingFactor,
          enableZoom: controls.enableZoom,
          enableRotate: controls.enableRotate,
          enablePan: controls.enablePan,
          minDistance: controls.minDistance,
          maxDistance: controls.maxDistance,
          minPolarAngle: controls.minPolarAngle,
          maxPolarAngle: controls.maxPolarAngle,
        }
      : null,
    renderer: renderer
      ? {
          antialias: Boolean(globalSettings?.antialias ?? true),
          alpha: Boolean(globalSettings?.alpha ?? true),
          logarithmicDepthBuffer: Boolean(globalSettings?.logarithmicDepthBuffer ?? true),
          pixelRatio: renderer.getPixelRatio(),
          pixelRatioSetting: String(globalSettings?.pixelRatio ?? '2'),
          toneMapping: toneMappingName,
          toneMappingExposure: renderer.toneMappingExposure,
          outputColorSpace: renderer.outputColorSpace,
          shadowMapEnabled: renderer.shadowMap.enabled,
          envMapIntensity: Number(globalSettings?.envMapIntensity ?? 1),
          correctLights: Boolean(globalSettings?.correctLights ?? false),
        }
      : null,
    postProcess: serializePostProcess(postProcessRaw),
    runtimeLights,
    metadata: {
      totalSceneChildren: scene.children.length,
      totalEditorObjects: editorObjects.length,
      totalEditorLights: editorLights.length,
      totalRuntimeLights: runtimeLights.length,
    },
  };
}

/** 下载场景配置 JSON */
export function downloadSceneConfig(filename?: string) {
  const config = generateSceneConfig();
  const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename ?? `scene-config-${Date.now()}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
