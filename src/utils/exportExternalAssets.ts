import * as THREE from 'three';

export const MATERIAL_TEXTURE_KEYS = [
  'map',
  'normalMap',
  'roughnessMap',
  'metalnessMap',
  'emissiveMap',
  'aoMap',
  'bumpMap',
  'alphaMap',
  'displacementMap',
] as const;

export interface PolyhavenTextureMeta {
  id: string;
  resolution: string;
  slot: string;
}

export interface CollectedTextureAsset {
  url: string;
  polyhaven?: PolyhavenTextureMeta;
}

export interface ExportedTextureAssetEntry {
  path: string;
  sourceUrl: string;
  polyhaven?: PolyhavenTextureMeta;
}

export interface PolyhavenModelSource {
  objectId: string;
  name: string;
  id: string;
  resolution: string;
}

export function getTextureSourceUrl(tex: THREE.Texture): string | null {
  const fromUserData = tex.userData?.sourceUrl;
  if (typeof fromUserData === 'string' && isFetchableTextureUrl(fromUserData)) {
    return fromUserData;
  }

  const img = tex.image;
  if (img instanceof HTMLImageElement) {
    const src = img.currentSrc || img.src;
    if (src && isFetchableTextureUrl(src)) return src;
  }

  return null;
}

export function isFetchableTextureUrl(url: string): boolean {
  return /^https?:\/\//i.test(url) || /^blob:/i.test(url);
}

export function isExternalHttpUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

export function tagPolyhavenTexture(
  tex: THREE.Texture,
  url: string,
  id: string,
  resolution: string,
  slot: string
) {
  tex.userData.sourceUrl = url;
  tex.userData.polyhaven = { id, resolution, slot };
}

/** 为模型网格上的远程贴图补充 sourceUrl（如 Poly Haven 模型） */
export function tagMeshExternalTextures(root: THREE.Object3D) {
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.forEach((mat) => {
      if (!mat) return;
      MATERIAL_TEXTURE_KEYS.forEach((key) => {
        const tex = (mat as unknown as Record<string, THREE.Texture | undefined>)[key];
        if (!tex || tex.userData?.sourceUrl) return;
        const url = getTextureSourceUrl(tex);
        if (url) tex.userData.sourceUrl = url;
      });
    });
  });
}

export function collectExternalTextures(root: THREE.Object3D): CollectedTextureAsset[] {
  const seen = new Set<string>();
  const result: CollectedTextureAsset[] = [];

  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.forEach((mat) => {
      if (!mat) return;
      MATERIAL_TEXTURE_KEYS.forEach((key) => {
        const tex = (mat as unknown as Record<string, THREE.Texture | undefined>)[key];
        if (!tex) return;
        const url = getTextureSourceUrl(tex);
        if (!url || seen.has(url)) return;
        seen.add(url);
        result.push({
          url,
          polyhaven: tex.userData?.polyhaven as PolyhavenTextureMeta | undefined,
        });
      });
    });
  });

  return result;
}

export function collectPolyhavenModels(scene: THREE.Scene): PolyhavenModelSource[] {
  const results: PolyhavenModelSource[] = [];

  scene.children.forEach((child) => {
    const src = child.userData?.polyhavenModel as
      | { id?: string; resolution?: string; name?: string }
      | undefined;
    if (!src?.id) return;

    const objectId = child.userData?.id || child.userData?.businessId;
    if (!objectId) return;

    results.push({
      objectId,
      name: src.name || child.name,
      id: src.id,
      resolution: src.resolution || '1k',
    });
  });

  return results;
}

function buildTextureFilename(url: string, index: number): string {
  try {
    const pathname = new URL(url).pathname;
    const base = pathname.split('/').pop() || `texture_${index}.jpg`;
    return base.replace(/[^\w.\-]+/g, '_');
  } catch {
    return `texture_${index}.jpg`;
  }
}

function uniqueFilename(filename: string, used: Set<string>): string {
  if (!used.has(filename)) {
    used.add(filename);
    return filename;
  }
  const dot = filename.lastIndexOf('.');
  const stem = dot > 0 ? filename.slice(0, dot) : filename;
  const ext = dot > 0 ? filename.slice(dot) : '';
  let i = 1;
  while (used.has(`${stem}_${i}${ext}`)) i += 1;
  const next = `${stem}_${i}${ext}`;
  used.add(next);
  return next;
}

export async function downloadTextureAssets(
  textures: CollectedTextureAsset[]
): Promise<Map<string, { data: ArrayBuffer; filename: string }>> {
  const map = new Map<string, { data: ArrayBuffer; filename: string }>();

  await Promise.all(
    textures.map(async (item, index) => {
      try {
        const response = await fetch(item.url);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const data = await response.arrayBuffer();
        map.set(item.url, {
          data,
          filename: buildTextureFilename(item.url, index),
        });
      } catch (error) {
        console.warn(`贴图下载失败: ${item.url}`, error);
      }
    })
  );

  return map;
}

function loadImageFromBuffer(buffer: ArrayBuffer): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const blob = new Blob([buffer]);
    const objectUrl = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('图片解码失败'));
    };
    img.src = objectUrl;
  });
}

function cloneMaterialTextures(material: THREE.Material): THREE.Material {
  const cloned = material.clone();
  MATERIAL_TEXTURE_KEYS.forEach((key) => {
    const tex = (cloned as unknown as Record<string, THREE.Texture | undefined>)[key];
    if (tex) {
      (cloned as unknown as Record<string, THREE.Texture | undefined>)[key] = tex.clone();
    }
  });
  return cloned;
}

/** 导出前深拷贝材质/贴图，避免改写编辑器中的贴图引用 */
export function deepCloneSceneMaterials(root: THREE.Object3D) {
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    if (Array.isArray(child.material)) {
      child.material = child.material.map((mat) => cloneMaterialTextures(mat));
      return;
    }
    if (child.material) {
      child.material = cloneMaterialTextures(child.material);
    }
  });
}

/**
 * GLTFExporter 对 ImageBitmap 嵌入不稳定，导出前转为 Canvas，避免打开项目后材质贴图丢失。
 */
export async function prepareTexturesForGlbExport(root: THREE.Object3D): Promise<void> {
  const tasks: Promise<void>[] = [];

  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.forEach((mat) => {
      if (!mat) return;
      MATERIAL_TEXTURE_KEYS.forEach((key) => {
        const tex = (mat as unknown as Record<string, THREE.Texture | undefined>)[key];
        if (!tex?.image) return;
        tasks.push(ensureExportableTextureImage(tex));
      });
    });
  });

  await Promise.all(tasks);
}

async function ensureExportableTextureImage(tex: THREE.Texture): Promise<void> {
  const img = tex.image as
    | HTMLImageElement
    | HTMLCanvasElement
    | ImageBitmap
    | OffscreenCanvas
    | null
    | undefined;
  if (!img) return;

  if (img instanceof HTMLCanvasElement) {
    tex.needsUpdate = true;
    return;
  }

  if (img instanceof HTMLImageElement) {
    if (!img.complete) {
      await new Promise<void>((resolve) => {
        const done = () => resolve();
        img.addEventListener('load', done, { once: true });
        img.addEventListener('error', done, { once: true });
      });
    }
    tex.needsUpdate = true;
    return;
  }

  const width =
    'width' in img && typeof img.width === 'number' ? img.width : 0;
  const height =
    'height' in img && typeof img.height === 'number' ? img.height : 0;
  if (!width || !height) return;

  try {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(img as CanvasImageSource, 0, 0);
    tex.image = canvas;
    tex.needsUpdate = true;
  } catch (error) {
    console.warn('贴图转为 Canvas 失败，GLB 可能丢失该贴图', error);
  }
}

/** 将已下载的贴图写入导出场景副本，供 GLTFExporter embedImages 嵌入 GLB */
export async function inlineDownloadedTextures(
  root: THREE.Object3D,
  downloaded: Map<string, { data: ArrayBuffer }>
) {
  const tasks: Promise<void>[] = [];

  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.forEach((mat) => {
      if (!mat) return;
      MATERIAL_TEXTURE_KEYS.forEach((key) => {
        const tex = (mat as unknown as Record<string, THREE.Texture | undefined>)[key];
        if (!tex) return;
        const sourceUrl = getTextureSourceUrl(tex);
        if (!sourceUrl) return;
        const asset = downloaded.get(sourceUrl);
        if (!asset) return;

        tasks.push(
          loadImageFromBuffer(asset.data)
            .then((img) => {
              tex.image = img;
              tex.needsUpdate = true;
            })
            .catch((error) => {
              console.warn(`贴图内联失败: ${sourceUrl}`, error);
            })
        );
      });
    });
  });

  await Promise.all(tasks);
}

export function packTextureAssetsForZip(
  textures: CollectedTextureAsset[],
  downloaded: Map<string, { data: ArrayBuffer; filename: string }>
): ExportedTextureAssetEntry[] {
  const usedNames = new Set<string>();
  const entries: ExportedTextureAssetEntry[] = [];

  textures.forEach((item) => {
    const asset = downloaded.get(item.url);
    if (!asset) return;
    const filename = uniqueFilename(asset.filename, usedNames);
    entries.push({
      path: `assets/textures/${filename}`,
      sourceUrl: item.url,
      polyhaven: item.polyhaven,
    });
  });

  return entries;
}

export function getTextureZipFiles(
  textures: CollectedTextureAsset[],
  downloaded: Map<string, { data: ArrayBuffer; filename: string }>,
  entries: ExportedTextureAssetEntry[]
): Array<{ path: string; data: ArrayBuffer }> {
  const urlToPath = new Map(entries.map((entry) => [entry.sourceUrl, entry.path]));

  return textures
    .map((item) => {
      const asset = downloaded.get(item.url);
      const path = urlToPath.get(item.url);
      if (!asset || !path) return null;
      return { path, data: asset.data };
    })
    .filter((item): item is { path: string; data: ArrayBuffer } => item !== null);
}
