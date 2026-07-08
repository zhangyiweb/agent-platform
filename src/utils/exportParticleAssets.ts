import type { ParticleEmitterConfig } from '@/types/particle';

export interface ParticleTextureZipFile {
  path: string;
  data: ArrayBuffer;
}

/** 将 blob / data URL 转为可打包的二进制贴图 */
async function resolveTextureBinary(
  url: string
): Promise<{ data: ArrayBuffer; ext: string } | null> {
  if (url.startsWith('data:')) {
    const match = url.match(/^data:image\/(\w+);base64,(.+)$/);
    if (!match) return null;
    const ext = match[1] === 'jpeg' ? 'jpg' : match[1];
    const binary = atob(match[2]);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return { data: bytes.buffer, ext };
  }

  if (url.startsWith('blob:') || url.startsWith('http://') || url.startsWith('https://')) {
    try {
      const response = await fetch(url);
      if (!response.ok) return null;
      const blob = await response.blob();
      const mimeExt = blob.type.split('/')[1];
      const ext = mimeExt === 'jpeg' ? 'jpg' : mimeExt || 'png';
      return { data: await blob.arrayBuffer(), ext };
    } catch {
      return null;
    }
  }

  return null;
}

/**
 * 导出前处理粒子配置：将自定义贴图写入 assets/textures/particles/，
 * 并把 customTextureUrl 改写为相对路径供运行时加载。
 */
export async function packParticleTexturesForExport(
  particles: Record<string, ParticleEmitterConfig>
): Promise<{
  particles: Record<string, ParticleEmitterConfig>;
  files: ParticleTextureZipFile[];
}> {
  const updated: Record<string, ParticleEmitterConfig> = { ...particles };
  const files: ParticleTextureZipFile[] = [];

  await Promise.all(
    Object.entries(particles).map(async ([id, cfg]) => {
      if (cfg.texture !== 'custom' || !cfg.customTextureUrl) return;

      const binary = await resolveTextureBinary(cfg.customTextureUrl);
      if (!binary) {
        console.warn(`粒子 ${id} 自定义贴图无法导出，将回退为内置 soft 贴图`);
        updated[id] = { ...cfg, texture: 'soft', customTextureUrl: undefined };
        return;
      }

      const filename = `${id}.${binary.ext}`;
      const path = `assets/textures/particles/${filename}`;
      files.push({ path, data: binary.data });
      updated[id] = {
        ...cfg,
        customTextureUrl: `./${path}`,
      };
    })
  );

  return { particles: updated, files };
}

/** 统计场景中的粒子发射器数量 */
export function countParticleEmitters(
  objects: Array<{ type: string }>,
  particles: Record<string, ParticleEmitterConfig>
): number {
  const particleObjects = objects.filter((o) => o.type === 'particle').length;
  return Math.max(particleObjects, Object.keys(particles).length);
}
