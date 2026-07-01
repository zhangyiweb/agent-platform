# Digital Twin Platform

A lightweight 3D scene editor built with **Three.js + React + TypeScript** for rapid digital twin scene authoring and export.

[![GitHub](https://img.shields.io/badge/GitHub-Digital--Twin--Platform-blue)](https://github.com/zhangyiweb/Digital-Twin-Platform)

## Features

- Scene tree and object management
- Local GLB/GLTF import (Draco) and **Poly Haven model library**
- 17 material types, texture upload, **Poly Haven PBR textures**
- UV editing and texture animation
- Multiple light types with helpers
- Transform controls (W/E/R shortcuts)
- HDR environment (Poly Haven), fog, post-processing
- Export: GLB, screenshot, JSON, **full project ZIP** (models, textures, HDR)
- Undo / redo

## Quick Start

```bash
git clone https://github.com/zhangyiweb/Digital-Twin-Platform.git
cd Digital-Twin-Platform
npm install
npm run dev
```

Open `http://localhost:5173` in your browser.

## Project Package Export

Export → **Export Project Package (ZIP)** produces a standalone HTML/JS project with embedded GLB, bundled textures, and HDR assets. Serve the folder with any static server (e.g. `npx serve .`).

## License

MIT License

## Links

- GitHub: https://github.com/zhangyiweb/Digital-Twin-Platform
- Gitee: https://gitee.com/zhangyiweb/3d-editor
