const API_BASE = 'https://api.polyhaven.com';

/** 可选 HDR 分辨率 */
export const HDR_RESOLUTIONS = ['1k', '2k', '4k', '8k', '16k'] as const;
export type HdrResolution = (typeof HDR_RESOLUTIONS)[number];

/** 默认预览分辨率 */
export const DEFAULT_RESOLUTION: HdrResolution = '2k';

/** 列表缩略图尺寸（CDN 动态裁剪，约 50~90KB） */
export const THUMB_WIDTH = 320;
export const THUMB_HEIGHT = 160;

export interface HdriAsset {
  id: string;
  name: string;
  categories: string[];
  tags: string[];
  thumbnail_url: string;
  fallback_thumbnail?: string;
}

export interface HdriCategory {
  name: string;
  count: number;
  label: string;
}

/** Poly Haven HDRI 分类中文名 */
const HDRI_CATEGORY_LABELS: Record<string, string> = {
  'natural light': '自然光',
  outdoor: '户外',
  nature: '自然',
  urban: '城市',
  'low contrast': '低对比度',
  'high contrast': '高对比度',
  'morning-afternoon': '上午/下午',
  'partly cloudy': '局部多云',
  indoor: '室内',
  skies: '天空',
  'medium contrast': '中对比度',
  clear: '晴朗',
  'artificial light': '人造光',
  'sunrise-sunset': '日出/日落',
  midday: '正午',
  overcast: '阴天',
  studio: '影棚',
  'pure skies': '纯净天空',
  night: '夜晚',
};

/** 将 Poly Haven 分类名转为中文显示 */
export function getHdriCategoryLabel(name: string): string {
  if (name.startsWith('collection: ')) {
    return `合集: ${name.slice('collection: '.length)}`;
  }
  return HDRI_CATEGORY_LABELS[name] ?? name;
}

/** 当前 HDR 的下载来源 */
export type HdrDownloadSource =
  | { kind: 'polyhaven'; id: string; resolution: string; filename: string }
  | { kind: 'url'; url: string; filename: string }
  | { kind: 'file'; file: File };

function triggerBlobDownload(blob: Blob, filename: string) {
  const a = document.createElement('a');
  const objectUrl = URL.createObjectURL(blob);
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(objectUrl);
}

/** 从 URL 下载文件到本地 */
export async function downloadFileFromUrl(url: string, filename: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`下载失败 (${res.status})`);
  const blob = await res.blob();
  triggerBlobDownload(blob, filename);
}

/** 根据来源下载当前 HDR 文件 */
export async function downloadHdrFromSource(source: HdrDownloadSource): Promise<void> {
  if (source.kind === 'file') {
    triggerBlobDownload(source.file, source.file.name);
    return;
  }

  if (source.kind === 'url') {
    await downloadFileFromUrl(source.url, source.filename);
    return;
  }

  const { url } = await fetchHdriUrl(source.id, source.resolution as HdrResolution);
  await downloadFileFromUrl(url, source.filename);
}

/** 侧边栏 HDRI 缩略图 */
export function getHdriPreviewUrl(id: string): string {
  return `https://cdn.polyhaven.com/asset_img/thumbs/${encodeURIComponent(id)}.png?width=${THUMB_WIDTH}&height=${THUMB_HEIGHT}`;
}

/** 获取全部 HDRI 资产列表 */
export async function fetchAllHdris(): Promise<HdriAsset[]> {
  const res = await fetch(`${API_BASE}/assets?t=hdris`);
  if (!res.ok) throw new Error(`获取 HDRI 列表失败: ${res.status}`);
  const data = await res.json() as Record<string, {
    name: string;
    categories?: string[];
    tags?: string[];
    thumbnail_url?: string;
  }>;
  return Object.entries(data).map(([id, meta]) => ({
    id,
    name: meta.name,
    categories: meta.categories ?? [],
    tags: meta.tags ?? [],
    thumbnail_url: getHdriPreviewUrl(id),
    fallback_thumbnail: meta.thumbnail_url,
  }));
}

/** 获取 HDRI 分类及数量 */
export async function fetchHdriCategories(): Promise<HdriCategory[]> {
  const res = await fetch(`${API_BASE}/categories/hdris`);
  if (!res.ok) throw new Error(`获取分类失败: ${res.status}`);
  const data = await res.json() as Record<string, number>;
  return Object.entries(data)
    .filter(([key]) => key !== 'all')
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ name, count, label: getHdriCategoryLabel(name) }));
}

/** 从 files 接口解析指定分辨率的 .hdr 下载 URL */
export async function fetchHdriUrl(
  id: string,
  resolution: HdrResolution = DEFAULT_RESOLUTION
): Promise<{ url: string; resolution: string }> {
  const res = await fetch(`${API_BASE}/files/${id}`);
  if (!res.ok) throw new Error(`获取文件信息失败: ${res.status}`);
  const files = await res.json() as {
    hdri?: Record<string, { hdr?: { url: string } }>;
  };

  const hdri = files.hdri;
  if (!hdri) throw new Error('该资产没有 HDRI 文件');

  const order: HdrResolution[] = ['16k', '8k', '4k', '2k', '1k'];
  const targetIdx = order.indexOf(resolution);
  const candidates = order.slice(targetIdx >= 0 ? targetIdx : order.indexOf('2k'));

  for (const resKey of candidates) {
    if (hdri[resKey]?.hdr?.url) {
      return { url: hdri[resKey].hdr!.url, resolution: resKey };
    }
  }

  for (const resKey of order) {
    if (hdri[resKey]?.hdr?.url) {
      return { url: hdri[resKey].hdr!.url, resolution: resKey };
    }
  }

  throw new Error('未找到可用的 HDR 文件');
}
