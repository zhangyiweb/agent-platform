import * as THREE from 'three';
import { useAnimationStore } from '@/store/animationStore';
import { findThreeObjectById } from '@/utils/sceneUtils';
import type { TextureAnimationTarget } from '@/types/textureAnimation';

const TEXTURE_KEYS = [
  'map',
  'normalMap',
  'roughnessMap',
  'metalnessMap',
  'emissiveMap',
  'aoMap',
  'bumpMap',
] as const;

function getTextureKeys(target: TextureAnimationTarget): readonly string[] {
  return target === 'all' ? TEXTURE_KEYS : ['map'];
}

function forEachAnimatedTexture(
  root: THREE.Object3D,
  target: TextureAnimationTarget,
  fn: (texture: THREE.Texture) => void
) {
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.forEach((material) => {
      if (!material) return;
      const mat = material as THREE.MeshStandardMaterial;
      getTextureKeys(target).forEach((key) => {
        const texture = (mat as unknown as Record<string, THREE.Texture | undefined>)[key];
        if (texture) fn(texture);
      });
    });
  });
}

/** 每帧更新贴图 UV 偏移动画 */
export function tickTextureUvAnimations(
  scene: THREE.Scene,
  deltaSeconds: number,
  getThreeObject?: (id: string) => THREE.Object3D | undefined
) {
  if (deltaSeconds <= 0) return;

  const { textureUvAnimations } = useAnimationStore.getState();

  Object.entries(textureUvAnimations).forEach(([objectId, config]) => {
    if (!config.enabled) return;
    if (config.speedU === 0 && config.speedV === 0) return;

    const object =
      getThreeObject?.(objectId) ?? findThreeObjectById(scene, objectId, getThreeObject);
    if (!object) return;

    forEachAnimatedTexture(object, config.target, (texture) => {
      texture.offset.x += config.speedU * deltaSeconds;
      texture.offset.y += config.speedV * deltaSeconds;
    });
  });
}
