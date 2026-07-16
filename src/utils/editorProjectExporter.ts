import JSZip from 'jszip';
import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { createModelsExportScene } from '@/utils/sceneUtils';
import { stampModelUserDataForExport, collectTextureUvStates } from '@/utils/exportSceneRestore';
import { normalizeObjectTextureUvs } from '@/utils/textureUvUtils';
import { generateSceneConfig, type ExportedSceneConfig } from '@/utils/sceneConfigExporter';
import {
  collectExternalTextures,
  collectPolyhavenModels,
  deepCloneSceneMaterials,
  downloadTextureAssets,
  getTextureZipFiles,
  inlineDownloadedTextures,
  packTextureAssetsForZip,
  prepareTexturesForGlbExport,
  type ExportedTextureAssetEntry,
  type PolyhavenModelSource,
} from '@/utils/exportExternalAssets';
import { fetchHdriUrl, type HdrDownloadSource, type HdrResolution } from '@/utils/polyhaven';
import { getExportableTours, buildCameraTourJson } from '@/utils/cameraTourJson';
import { useTourStore } from '@/store/tourStore';
import { useUIEditorStore } from '@/store/uiEditorStore';
import { packUiPagesForZip } from '@/utils/uiPageZipAssets';
import { ZIP_GENERATE_OPTIONS } from '@/utils/zipExport';
import type { CameraTour } from '@/types/cameraTour';

export const EDITOR_PROJECT_FORMAT = 'editor-project';
export const EDITOR_PROJECT_VERSION = '1.0.0';

async function exportGlbBuffer(
  scene: THREE.Scene,
  downloadedTextures: Map<string, { data: ArrayBuffer; filename: string }>
): Promise<ArrayBuffer> {
  const exportScene = createModelsExportScene(scene);
  deepCloneSceneMaterials(exportScene);
  normalizeObjectTextureUvs(exportScene);
  stampModelUserDataForExport(exportScene);
  await inlineDownloadedTextures(exportScene, downloadedTextures);
  await prepareTexturesForGlbExport(exportScene);

  return new Promise((resolve, reject) => {
    const exporter = new GLTFExporter();
    exporter.parse(
      exportScene,
      (result) => {
        if (result instanceof ArrayBuffer) {
          resolve(result);
          return;
        }
        reject(new Error('GLB 导出失败：未生成二进制数据'));
      },
      (error) => reject(error instanceof Error ? error : new Error(String(error))),
      { binary: true, trs: true, onlyVisible: false, embedImages: true }
    );
  });
}

async function resolveHdrAsset(): Promise<{ data: ArrayBuffer; filename: string } | null> {
  const scene = (window as any).__editorScene as THREE.Scene | undefined;
  const globalSettings = ((window as any).__globalSettingsState ?? null) as Record<string, unknown> | null;
  const hasHdr =
    Boolean(scene?.environment) ||
    Boolean(scene?.background && (scene.background as THREE.Texture).isTexture) ||
    Boolean(globalSettings?.hdriReady);

  if (!hasHdr) return null;

  const source = window.__hdrExportSource;
  if (source?.kind === 'file') {
    return {
      data: await source.file.arrayBuffer(),
      filename: source.file.name || 'environment.hdr',
    };
  }

  if (source?.kind === 'polyhaven') {
    const { url } = await fetchHdriUrl(source.id, source.resolution as HdrResolution);
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HDR 下载失败: ${response.status}`);
    }
    return {
      data: await response.arrayBuffer(),
      filename: source.filename || `${source.id}_${source.resolution}.hdr`,
    };
  }

  return null;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function writeCameraTourFiles(
  root: JSZip,
  tours: CameraTour[],
  activeTourId: string | null
): void {
  const exportable = getExportableTours(tours);
  if (exportable.length === 0) return;

  exportable.forEach((tour) => {
    root.file(
      `config/camera-tours/${tour.id}.json`,
      JSON.stringify(buildCameraTourJson(tour), null, 2)
    );
  });
}

/** 保存可重新导入的完整编辑器项目包（场景 + UI 画布，ZIP） */
export async function saveEditorProject(): Promise<{
  filename: string;
  pageCount: number;
  pageNames: string[];
  imageCount: number;
  hasModel: boolean;
  hasSceneObjects: boolean;
}> {
  const scene = (window as any).__editorScene as THREE.Scene | undefined;
  if (!scene) {
    throw new Error('场景尚未初始化，请等待编辑器加载完成后再保存');
  }

  const timestamp = Date.now();
  const folderName = `digital-twin-project-${timestamp}`;
  const zip = new JSZip();
  const root = zip.folder(folderName);
  if (!root) {
    throw new Error('无法创建 ZIP 目录');
  }

  const baseConfig = generateSceneConfig();
  const textureUvStates = collectTextureUvStates(scene);
  const assets: {
    model?: string;
    hdr?: string;
    textures?: ExportedTextureAssetEntry[];
  } = {};

  const externalTextures = collectExternalTextures(scene);
  const polyhavenModels = collectPolyhavenModels(scene);
  const downloadedTextures = await downloadTextureAssets(externalTextures);
  const textureEntries = packTextureAssetsForZip(externalTextures, downloadedTextures);
  const textureZipFiles = getTextureZipFiles(externalTextures, downloadedTextures, textureEntries);

  textureZipFiles.forEach(({ path, data }) => {
    root.file(path, data);
  });
  if (textureEntries.length > 0) {
    assets.textures = textureEntries;
  }

  let hasModel = false;
  try {
    const glbBuffer = await exportGlbBuffer(scene, downloadedTextures);
    if (glbBuffer.byteLength > 0) {
      root.file('assets/models/scene.glb', glbBuffer);
      assets.model = 'assets/models/scene.glb';
      hasModel = true;
    }
  } catch (error) {
    console.warn('模型 GLB 保存失败，项目将仅包含配置', error);
  }

  try {
    const hdrAsset = await resolveHdrAsset();
    if (hdrAsset) {
      const safeName = hdrAsset.filename.replace(/[^\w.\-]+/g, '_');
      const hdrPath = `assets/hdr/${safeName}`;
      root.file(hdrPath, hdrAsset.data);
      assets.hdr = hdrPath;
    }
  } catch (error) {
    console.warn('HDR 资源保存失败', error);
  }

  const { tours, activeTourId } = useTourStore.getState();
  writeCameraTourFiles(root, tours, activeTourId);

  // 始终嵌入全部 UI 画布（与场景一体保存）
  useUIEditorStore.getState().flushActivePage();
  const uiState = useUIEditorStore.getState();
  const uiPagesSnap = uiState.getPagesSnapshot();
  const packed = packUiPagesForZip(uiPagesSnap, 'assets/ui-pages');
  packed.files.forEach(({ path, data }) => root.file(path, data));

  const projectConfig: ExportedSceneConfig & {
    format: string;
    assets?: typeof assets;
    editor: ExportedSceneConfig['editor'] & {
      textureUvStates: typeof textureUvStates;
      polyhavenModels?: PolyhavenModelSource[];
    };
  } = {
    ...baseConfig,
    version: EDITOR_PROJECT_VERSION,
    format: EDITOR_PROJECT_FORMAT,
    assets,
    editor: {
      ...baseConfig.editor,
      textureUvStates,
      ...(polyhavenModels.length > 0 ? { polyhavenModels } : {}),
      ...(tours.length > 0 ? { cameraTours: tours, activeCameraTourId: activeTourId } : {}),
      uiPages: packed.pages,
      previewPageId: uiState.previewPageId,
      activePageId: uiState.activePageId,
    },
  };

  root.file('config/scene.json', JSON.stringify(projectConfig, null, 2));
  root.file(
    'README.md',
    `# 数字孪生完整项目包

保存时间：${baseConfig.exportTime}

本压缩包同时包含：
- 3D 场景（模型、灯光、标签、粒子、漫游等）
- UI 编排画布（\`editor.uiPages\`）

可用「场景编辑」或「UI 编排」中的「打开项目」载入。
`
  );

  const blob = await zip.generateAsync(ZIP_GENERATE_OPTIONS);
  const filename = `${folderName}.zip`;
  downloadBlob(blob, filename);
  return {
    filename,
    pageCount: packed.pages.length,
    pageNames: packed.pages.map((p) => p.name),
    imageCount: packed.imageCount,
    hasModel,
    hasSceneObjects: (baseConfig.editor.objects?.length ?? 0) > 0,
  };
}
