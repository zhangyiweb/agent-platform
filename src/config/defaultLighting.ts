import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { LightConfig } from '@/types/light';

/** 真实感渲染：色调映射曝光（整体明暗总开关） */
export const DEFAULT_TONE_MAPPING_EXPOSURE = 0.4;

/** 默认灯光 ID（与 lightStore 一致） */
export const DEFAULT_SUN_LIGHT_ID = 'light_sun_default';
export const DEFAULT_HEMI_LIGHT_ID = 'light_hemi_default';

/** 默认太阳平行光 + 半球补光 */
export const DEFAULT_LIGHTS: LightConfig[] = [
  {
    id: DEFAULT_SUN_LIGHT_ID,
    name: '太阳(平行光)',
    type: 'directional',
    enabled: true,
    color: '#fff3df',
    intensity: 3.0,
    position: [120, 200, 80],
    target: [0, 0, 0],
    castShadow: true,
    shadowMapSize: 2048,
    shadowCameraNear: 1,
    shadowCameraFar: 600,
    shadowCameraLeft: -160,
    shadowCameraRight: 160,
    shadowCameraTop: 160,
    shadowCameraBottom: -160,
    shadowBias: -0.0002,
  },
  {
    id: DEFAULT_HEMI_LIGHT_ID,
    name: '半球补光',
    type: 'hemisphere',
    enabled: true,
    color: '#bcd6ff',
    groundColor: '#5a4a36',
    intensity: 0.5,
    castShadow: false,
  },
];

/** ① 渲染器色彩 / 色调映射 / 阴影 */
export function applyRendererLightingDefaults(
  renderer: THREE.WebGLRenderer,
  exposure = DEFAULT_TONE_MAPPING_EXPOSURE
) {
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = exposure;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
}

/** ② 程序化 IBL：RoomEnvironment（无需 HDR 文件） */
export function applyDefaultRoomEnvironment(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene
): THREE.Texture {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = envTexture;
  scene.environmentIntensity = 1.0;
  pmrem.dispose();
  return envTexture;
}

/** ③ 平行光阴影相机参数 */
export function applyDirectionalShadowSettings(
  light: THREE.DirectionalLight,
  config: Partial<LightConfig>
) {
  light.castShadow = config.castShadow ?? false;
  if (!light.castShadow) return;

  const mapSize = config.shadowMapSize ?? 2048;
  light.shadow.mapSize.set(mapSize, mapSize);

  const cam = light.shadow.camera as THREE.OrthographicCamera;
  cam.near = config.shadowCameraNear ?? 1;
  cam.far = config.shadowCameraFar ?? 600;
  cam.left = config.shadowCameraLeft ?? -160;
  cam.right = config.shadowCameraRight ?? 160;
  cam.top = config.shadowCameraTop ?? 160;
  cam.bottom = config.shadowCameraBottom ?? -160;
  light.shadow.bias = config.shadowBias ?? -0.0002;
  cam.updateProjectionMatrix();
}

/** ⑥ 为 Mesh 开启投射/接收阴影 */
export function enableMeshShadows(root: THREE.Object3D) {
  root.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });
}
