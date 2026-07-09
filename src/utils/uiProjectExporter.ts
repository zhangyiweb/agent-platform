import JSZip from 'jszip';
import type { UIElement } from '@/types/uiEditor';
import {
  buildUIExportBundle,
  buildUIIndexHtml,
  buildUIStyleCss,
  parseDataUrl,
} from '@/utils/uiExportCore';

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
├── index.html              # 页面入口（语义化 HTML，无内联样式）
├── css/
│   └── style.css           # 全局样式、元素布局、悬停效果
├── js/
│   └── main.js             # 入口脚本（图表初始化 + 二次开发钩子）
└── assets/images/          # 切图与背景图资源
\`\`\`

## 设计尺寸

${canvasWidth} × ${canvasHeight}

## 使用方式

1. **本地预览**：在项目根目录执行 \`npx serve .\`，浏览器访问提示的地址
2. **样式修改**：编辑 \`css/style.css\`，各元素通过 \`#元素id\` 选择器定位
3. **交互逻辑**：在 \`js/main.js\` 的「二次开发入口」区域绑定事件、对接接口
4. **图表数据**：修改 \`js/main.js\` 中 \`chartConfigs\` 的 \`option\` 字段，或调用 \`chart.setOption()\` 动态更新
5. **图片资源**：\`assets/images/\` 下的文件需与 HTML 保持相对路径，或自行替换为 CDN 地址

## 二次开发说明

- 每个元素在编辑器中可设置自定义 \`id\` 和 \`class\`，导出后可直接用于 DOM 查询
- HTML 仅包含结构与语义标签，样式全部在 CSS 文件中
- JS 使用 IIFE 包裹，避免全局污染；可按需改为 ES Module 或接入构建工具
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

  const exportTime = new Date().toISOString();
  const title = `UI 页面 ${new Date(exportTime).toLocaleString('zh-CN')}`;

  root.file('index.html', buildUIIndexHtml(bundle, canvasWidth, canvasHeight, title));
  root.file('css/style.css', buildUIStyleCss(bundle));
  root.file('js/main.js', bundle.mainJs);
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
