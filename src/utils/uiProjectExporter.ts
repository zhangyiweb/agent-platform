import JSZip from 'jszip';
import type { UIElement } from '@/types/uiEditor';
import { buildUIExportBundle, parseDataUrl } from '@/utils/uiExportCore';

export interface UIProjectExportResult {
  filename: string;
  imageCount: number;
  elementCount: number;
}

function buildReadme(canvasWidth: number, canvasHeight: number, exportTime: string): string {
  return `# UI 编排导出项目

由数字孪生平台 UI 编排编辑器于 ${exportTime} 导出。

## 目录结构

\`\`\`
├── index.html              # 单文件页面（CSS / JS 已内联，可直接复制使用）
└── assets/images/          # 切图与背景图资源
\`\`\`

## 设计尺寸

${canvasWidth} × ${canvasHeight}

## 使用方式

1. **整页复制**：打开 \`index.html\`，将 \`<style>\` 与 \`<script>\` 内容复制到你的项目中
2. **图片资源**：\`assets/images/\` 下的文件需与 HTML 保持相对路径，或自行替换为 CDN 地址
3. **二次开发**：通过各元素的 \`id\` / \`class\` 绑定业务逻辑；图表使用 ECharts CDN，可在内联脚本中对接动态数据

## 本地预览

\`\`\`bash
npx serve .
\`\`\`
`;
}

/** 导出完整 UI 项目包（ZIP） */
export async function exportUIProjectPackage(
  elements: UIElement[],
  canvasWidth: number,
  canvasHeight: number,
  canvasBackground: string
): Promise<UIProjectExportResult> {
  const timestamp = Date.now();
  const folderName = `ui-project-${timestamp}`;
  const zip = new JSZip();
  const root = zip.folder(folderName);
  if (!root) throw new Error('无法创建 ZIP 目录');

  const imageFiles = new Map<string, Uint8Array>();
  const imagePathCache = new Map<string, string>();
  let imageCount = 0;

  const resolveImage = (elementId: string, dataUrl: string, kind: 'src' | 'background'): string => {
    const cacheKey = `${elementId}:${kind}`;
    const cached = imagePathCache.get(cacheKey);
    if (cached) return cached;

    const parsed = parseDataUrl(dataUrl);
    if (!parsed) return dataUrl;

    const shortId = elementId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8) || 'img';
    const filename = `${kind}-${shortId}.${parsed.ext}`;
    const relativePath = `assets/images/${filename}`;
    imagePathCache.set(cacheKey, relativePath);
    imageFiles.set(relativePath, parsed.bytes);
    imageCount += 1;
    return relativePath;
  };

  const bundle = buildUIExportBundle(elements, canvasWidth, canvasHeight, canvasBackground, {
    resolveImage,
  });

  imageFiles.forEach((bytes, path) => {
    root.file(path, bytes);
  });

  const hoverBlock = bundle.hoverCss ? `\n    ${bundle.hoverCss}` : '';
  const chartScript = bundle.hasCharts
    ? `
  <script src="https://cdn.jsdelivr.net/npm/echarts@5.5.1/dist/echarts.min.js"><\/script>
  <script>
${bundle.chartInitJs}
  <\/script>`
    : '';

  const indexHtml = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>UI 页面</title>
  <style>
    ${bundle.baseCss}${hoverBlock}
  </style>
</head>
<body>
  <div class="ui-page" data-design-width="${canvasWidth}" data-design-height="${canvasHeight}">
    ${bundle.bodyHtml}
  </div>${chartScript}
</body>
</html>`;

  root.file('index.html', indexHtml);

  const exportTime = new Date().toISOString();
  root.file('README.md', buildReadme(canvasWidth, canvasHeight, exportTime));

  const blob = await zip.generateAsync({ type: 'blob' });
  const filename = `${folderName}.zip`;
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);

  return { filename, imageCount, elementCount: elements.length };
}
