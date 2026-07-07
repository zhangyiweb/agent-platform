import * as THREE from 'three';
import type { ParticleEmitterConfig, ParticleTextureKind } from '@/types/particle';

const textureCache = new Map<ParticleTextureKind, THREE.Texture>();
const customTextureCache = new Map<string, THREE.Texture>();

function createCanvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('无法创建 Canvas 2D 上下文');
  return [canvas, ctx];
}

/** 柔和圆形光斑 */
function buildSoftTexture(): THREE.Texture {
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

/** 烟雾团块纹理（多团叠加） */
function buildSmokeTexture(): THREE.Texture {
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
    g.addColorStop(0, `rgba(255,255,255,${a})`);
    g.addColorStop(0.5, `rgba(255,255,255,${a * 0.4})`);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
  });

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/** 火花/星芒纹理 */
function buildSparkTexture(): THREE.Texture {
  const [canvas, ctx] = createCanvas(128);
  ctx.translate(64, 64);

  const drawRay = (angle: number, len: number, width: number, alpha: number) => {
    ctx.save();
    ctx.rotate(angle);
    const g = ctx.createLinearGradient(0, 0, len, 0);
    g.addColorStop(0, `rgba(255,255,255,${alpha})`);
    g.addColorStop(0.35, `rgba(255,245,200,${alpha * 0.85})`);
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

  for (let i = 0; i < 8; i++) {
    drawRay((Math.PI * 2 * i) / 8, 58, 4.5, 1);
  }
  for (let i = 0; i < 8; i++) {
    drawRay((Math.PI * 2 * i) / 8 + Math.PI / 8, 38, 2.5, 0.75);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/** 获取粒子贴图（带缓存） */
export function getParticleTexture(kind: ParticleTextureKind): THREE.Texture {
  const cached = textureCache.get(kind);
  if (cached) return cached;

  let tex: THREE.Texture;
  switch (kind) {
    case 'smoke':
      tex = buildSmokeTexture();
      break;
    case 'spark':
      tex = buildSparkTexture();
      break;
    case 'custom':
      tex = buildSoftTexture();
      break;
    default:
      tex = buildSoftTexture();
  }

  textureCache.set(kind, tex);
  return tex;
}

/** 根据配置解析粒子贴图（支持自定义上传） */
export function resolveParticleTexture(config: ParticleEmitterConfig): THREE.Texture {
  if (config.texture === 'custom' && config.customTextureUrl) {
    const cached = customTextureCache.get(config.customTextureUrl);
    if (cached) return cached;

    const loader = new THREE.TextureLoader();
    const tex = loader.load(config.customTextureUrl);
    tex.colorSpace = THREE.SRGBColorSpace;
    customTextureCache.set(config.customTextureUrl, tex);
    return tex;
  }

  return getParticleTexture(config.texture === 'custom' ? 'soft' : config.texture);
}

/** 释放贴图缓存 */
export function disposeParticleTextures() {
  textureCache.forEach((tex) => tex.dispose());
  textureCache.clear();
  customTextureCache.forEach((tex) => tex.dispose());
  customTextureCache.clear();
}
