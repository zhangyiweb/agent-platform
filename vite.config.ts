import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

/** GitHub Pages 项目站：https://zhangyiweb.github.io/Digital-Twin-Platform/ */
const GITHUB_PAGES_BASE = '/Digital-Twin-Platform/'

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
