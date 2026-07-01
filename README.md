# Digital Twin Platform · 数字孪生平台

基于 **Three.js + React + TypeScript** 的轻量级 3D 场景编辑器，用于数字孪生场景的快速搭建、编辑与导出。

[![GitHub](https://img.shields.io/badge/GitHub-Digital--Twin--Platform-blue)](https://github.com/zhangyiweb/Digital-Twin-Platform)
[![Gitee](https://img.shields.io/badge/Gitee-3d--editor-red)](https://gitee.com/zhangyiweb/3d-editor)

## 核心特性

- **场景管理** — 场景树、对象选择/删除、实时统计
- **模型导入** — 本地 GLB/GLTF（Draco），**Poly Haven 模型库**一键导入
- **材质系统** — 17 种材质类型，贴图上传，**Poly Haven PBR 贴图库**
- **UV 编辑** — 重复/偏移/旋转/包裹模式，贴图 UV 动画
- **灯光系统** — 多种灯光类型，Helper 可视化
- **变换控制** — 移动/旋转/缩放，键盘快捷键
- **环境设置** — 背景色、HDR 环境贴图（含 Poly Haven）、雾效
- **后期处理** — Bloom、FXAA、Sobel 等效果
- **导出** — GLB、截图、场景 JSON、**完整项目包 ZIP**（含模型/贴图/HDR）
- **撤销/重做** — 操作历史记录

## 技术栈

| 类别 | 技术 |
|------|------|
| 3D 引擎 | Three.js r185 |
| UI | React 18 + Ant Design 5 |
| 语言 | TypeScript 5 |
| 构建 | Vite 5 |
| 样式 | Tailwind CSS |
| 状态 | Zustand |

## 快速开始

```bash
# 克隆仓库
git clone https://github.com/zhangyiweb/Digital-Twin-Platform.git
cd Digital-Twin-Platform

# 安装依赖
npm install

# 启动开发服务器
npm run dev
```

浏览器访问 `http://localhost:5173`

## 使用说明

### 导入模型

- **本地文件**：工具栏导入 GLB/GLTF
- **模型库**：工具栏「模型库」从 [Poly Haven](https://polyhaven.com/models) 选择并导入

### 编辑材质

1. 选中场景中的模型
2. 右侧「材质」面板调节 PBR 参数
3. 点击「从 Poly Haven 选择贴图」应用在线 PBR 贴图集
4. 「UV 设置」调节贴图重复、偏移与动画

### 导出项目包

工具栏 → 导出 → **导出项目包 (ZIP)**，将生成：

```
digital-twin-project-*/
├── index.html
├── css/style.css
├── js/main.js
├── config/scene.json
├── assets/
│   ├── models/scene.glb
│   ├── textures/     # Poly Haven 及外部贴图
│   └── hdr/          # HDR 环境（如有）
└── README.md
```

解压后用静态服务器（`npx serve .`）即可预览。

### 快捷键

| 按键 | 功能 |
|------|------|
| W | 移动 |
| E | 旋转 |
| R | 缩放 |
| Ctrl+Z | 撤销 |
| Ctrl+Y | 重做 |

## 项目结构

```
src/
├── components/
│   ├── Panels/       # 场景树、材质、灯光、导出等面板
│   ├── Toolbar/      # 顶部工具栏（模型库等）
│   └── Viewport/     # 3D 视口
├── hooks/            # 模型加载、导出、快捷键
├── store/            # Zustand 状态
├── utils/            # Poly Haven API、项目包导出等
└── config/           # 默认灯光、导出默认值
```

## 仓库地址

- **GitHub**：https://github.com/zhangyiweb/Digital-Twin-Platform
- **Gitee**：https://gitee.com/zhangyiweb/3d-editor

## 许可证

MIT License

## 参与贡献

1. Fork 本仓库
2. 新建功能分支
3. 提交 Pull Request
