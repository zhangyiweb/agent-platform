import JSZip from 'jszip';
import type { UIElement, UIPage } from '@/types/uiEditor';
import {
  buildReactComponent,
  buildUIExportBundle,
  buildUIIndexHtml,
  buildUIStyleCss,
  buildVueSfc,
  parseDataUrl,
  type UIExportBundle,
} from '@/utils/uiExportCore';

export type UIExportFormat = 'html' | 'vue' | 'react';

export interface UIProjectExportResult {
  filename: string;
  imageCount: number;
  elementCount: number;
  pageCount: number;
  format: UIExportFormat;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

/** 生成安全的目录/文件名 */
export function slugifyPageName(name: string, fallback: string): string {
  const slug = name
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w\u4e00-\u9fff-]+/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return slug || fallback;
}

/** 生成合法的组件标识符（用于 React 函数名等；文件名请用 slug） */
export function toComponentName(name: string, index: number): string {
  const slug = slugifyPageName(name, `画布${index + 1}`).replace(/-/g, '_');
  // 中文或字母开头均可作为标识符
  if (/^[\u4e00-\u9fff]/.test(slug)) return slug;
  if (/^[A-Za-z_$]/.test(slug)) {
    return slug.charAt(0).toUpperCase() + slug.slice(1);
  }
  return `Page${index + 1}`;
}

/** 将逻辑路径 assets/images/x 替换为实际相对路径前缀 */
function remapAssetPaths(content: string, toPrefix: string): string {
  return content.replace(/(?:(?:\.\.\/)+)?assets\/images\//g, toPrefix);
}

function buildHtmlReadme(
  pages: { name: string; file: string }[],
  exportTime: string
): string {
  const list = pages.map((p) => `- \`${p.file}\` — ${p.name}`).join('\n');
  return `# UI 编排导出项目（HTML）

由数字孪生平台于 ${exportTime} 导出，共 ${pages.length} 个画布。

## 目录结构

\`\`\`
├── <画布名称>.html            # 与 assets 同级，按画布命名
├── css/<画布名称>.css
├── js/<画布名称>.js
└── assets/images/             # 公共图片资源
\`\`\`

## 页面列表

${list}

## 使用方式

1. 本地预览：\`npx serve .\`，直接打开对应的 \`.html\` 文件
2. 修改样式：编辑 \`css/<画布名称>.css\`
3. 绑定逻辑：编辑 \`js/<画布名称>.js\`
`;
}

function buildVueReadme(pages: { name: string; file: string }[], exportTime: string): string {
  const list = pages.map((p) => `- \`${p.file}\` — ${p.name}`).join('\n');
  return `# UI 编排导出项目（Vue 3）

由数字孪生平台于 ${exportTime} 导出，共 ${pages.length} 个画布。

## 目录结构

\`\`\`
├── <画布名称>.vue             # 与 assets 同级，按画布命名
└── assets/images/             # 公共图片资源
\`\`\`

## 页面列表

${list}

## 使用方式

1. 将 \`.vue\` 文件与 \`assets\` 复制到你的 Vue 3 项目
2. 在路由中注册页面组件
3. 若含图表，请安装：\`npm i echarts\`
4. 样式已写在 SFC 的 \`<style>\` 中，可直接二次开发
`;
}

function buildReactReadme(pages: { name: string; file: string }[], exportTime: string): string {
  const list = pages.map((p) => `- \`${p.file}\` — ${p.name}`).join('\n');
  return `# UI 编排导出项目（React）

由数字孪生平台于 ${exportTime} 导出，共 ${pages.length} 个画布。

## 目录结构

\`\`\`
├── <画布名称>.tsx             # 与 assets 同级，按画布命名
├── <画布名称>.css
└── assets/images/             # 公共图片资源
\`\`\`

## 页面列表

${list}

## 使用方式

1. 将 \`.tsx\` / \`.css\` 与 \`assets\` 复制到你的 React 项目
2. 在路由中引入页面组件
3. 若含图表，请安装：\`npm i echarts\`
4. 样式在同名 \`.css\` 文件中，可按 class / id 二次开发
`;
}

interface PackedPage {
  page: UIPage;
  slug: string;
  componentName: string;
  bundle: UIExportBundle;
}

function remapBundle(bundle: UIExportBundle, htmlPrefix: string): UIExportBundle {
  return {
    ...bundle,
    bodyHtml: remapAssetPaths(bundle.bodyHtml, htmlPrefix),
    elementCss: remapAssetPaths(bundle.elementCss, htmlPrefix),
    hoverCss: remapAssetPaths(bundle.hoverCss, htmlPrefix),
    baseCss: remapAssetPaths(bundle.baseCss, htmlPrefix),
  };
}

/** 导出完整 UI 项目包（支持多页面 + html/vue/react） */
export async function exportUIProjectPackage(
  pages: UIPage[],
  format: UIExportFormat = 'html'
): Promise<UIProjectExportResult> {
  if (pages.length === 0) {
    throw new Error('没有可导出的页面');
  }

  const timestamp = Date.now();
  const folderName = `ui-project-${format}-${timestamp}`;
  const zip = new JSZip();
  const root = zip.folder(folderName);
  if (!root) throw new Error('无法创建 ZIP 目录');

  const imageFiles = new Map<string, Uint8Array>();
  const imagePathCache = new Map<string, string>();
  let imageCount = 0;
  let elementCount = 0;

  /** 统一逻辑路径：assets/images/xxx */
  const resolveImage = (elementId: string, dataUrl: string, kind: 'src' | 'background'): string => {
    const cacheKey = `${elementId}:${kind}:${dataUrl.slice(0, 80)}`;
    const cached = imagePathCache.get(cacheKey);
    if (cached) return cached;

    const parsed = parseDataUrl(dataUrl);
    if (!parsed) return dataUrl;

    const shortId = elementId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8) || 'img';
    const filename = `${kind}-${shortId}.${parsed.ext}`;
    const relativePath = `assets/images/${filename}`;
    imagePathCache.set(cacheKey, relativePath);
    if (!imageFiles.has(relativePath)) {
      imageFiles.set(relativePath, parsed.bytes);
      imageCount += 1;
    }
    return relativePath;
  };

  const usedSlugs = new Set<string>();
  const packed = pages.map((page, index) => {
    elementCount += page.elements.length;
    let slug = slugifyPageName(page.name, `画布${index + 1}`);
    if (usedSlugs.has(slug)) slug = `${slug}-${index + 1}`;
    usedSlugs.add(slug);

    const bundle = buildUIExportBundle(
      page.elements,
      page.canvasWidth,
      page.canvasHeight,
      page.canvasBackground,
      { resolveImage }
    );

    return {
      page,
      slug,
      componentName: toComponentName(page.name, index),
      bundle,
    };
  });

  const exportTime = new Date().toISOString();
  // HTML / Vue / React 统一：资源与页面文件同级
  const assetsBase = 'assets/images/';

  imageFiles.forEach((bytes, logicalPath) => {
    const filename = logicalPath.replace(/^assets\/images\//, '');
    root.file(`${assetsBase}${filename}`, bytes);
  });

  if (format === 'html') {
    const pageMeta: { name: string; file: string }[] = [];

    packed.forEach((p) => {
      const htmlBundle = remapBundle(p.bundle, 'assets/images/');
      const cssBundle = remapBundle(p.bundle, '../assets/images/');
      const htmlFile = `${p.slug}.html`;
      const cssFile = `css/${p.slug}.css`;
      const jsFile = `js/${p.slug}.js`;

      root.file(
        htmlFile,
        buildUIIndexHtml(htmlBundle, p.page.canvasWidth, p.page.canvasHeight, p.page.name, {
          cssHref: `./${cssFile}`,
          jsSrc: `./${jsFile}`,
        })
      );
      root.file(cssFile, buildUIStyleCss(cssBundle, { external: false }));
      root.file(jsFile, p.bundle.mainJs);
      pageMeta.push({ name: p.page.name, file: htmlFile });
    });

    root.file('README.md', buildHtmlReadme(pageMeta, exportTime));
  } else if (format === 'vue') {
    const pageMeta: { name: string; file: string }[] = [];
    packed.forEach((p) => {
      const vueBundle = remapBundle(p.bundle, './assets/images/');
      const sfc = buildVueSfc(
        vueBundle,
        p.page.canvasWidth,
        p.page.canvasHeight,
        p.page.name,
        { external: false }
      );
      const file = `${p.slug}.vue`;
      root.file(file, sfc);
      pageMeta.push({ name: p.page.name, file });
    });
    root.file('README.md', buildVueReadme(pageMeta, exportTime));
  } else {
    const pageMeta: { name: string; file: string }[] = [];
    packed.forEach((p) => {
      const reactBundle = remapBundle(p.bundle, './assets/images/');
      const css = buildUIStyleCss(reactBundle, { external: false });
      const tsx = buildReactComponent(
        reactBundle,
        p.page.canvasWidth,
        p.page.canvasHeight,
        p.componentName,
        `${p.slug}.css`
      );
      root.file(`${p.slug}.tsx`, tsx);
      root.file(`${p.slug}.css`, css);
      pageMeta.push({ name: p.page.name, file: `${p.slug}.tsx` });
    });
    root.file('README.md', buildReactReadme(pageMeta, exportTime));
  }

  const blob = await zip.generateAsync({ type: 'blob' });
  const filename = `${folderName}.zip`;
  downloadBlob(blob, filename);

  return { filename, imageCount, elementCount, pageCount: pages.length, format };
}

/** @deprecated 兼容旧单页调用 */
export async function exportUIProjectPackageLegacy(
  elements: UIElement[],
  canvasWidth: number,
  canvasHeight: number,
  canvasBackground: string
): Promise<UIProjectExportResult> {
  return exportUIProjectPackage(
    [
      {
        id: 'page_1',
        name: '页面 1',
        canvasWidth,
        canvasHeight,
        canvasBackground,
        elements,
      },
    ],
    'html'
  );
}
