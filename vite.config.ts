import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

/** GitHub Pages 使用相对路径，避免子目录部署时资源 404 */
const GITHUB_PAGES_BASE = './'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const isGhPagesBuild = mode === 'production' || mode === 'pages'

  return {
    // 生产 / GitHub Pages 构建使用仓库子路径；本地 dev 仍为 /
    base: isGhPagesBuild ? GITHUB_PAGES_BASE : '/',
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
      dedupe: ['three'],
    },
    server: {
      port: 5173,
      open: true,
    },
    build: {
      outDir: mode === 'pages' ? 'docs' : 'dist',
      sourcemap: false,
    },
  }
})
