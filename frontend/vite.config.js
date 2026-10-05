import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import process from 'node:process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const PWA_THEME = '#7165ef'
const PWA_BACKGROUND = '#080b12'

const API_PATH_PATTERN = ({ url, request }) => {
  if (request.mode === 'navigate') return false
  const path = url.pathname
  return (
    path.startsWith('/api')
    || path.startsWith('/auth')
    || path.includes('/session')
    || path.includes('/models')
  )
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
 const env = loadEnv(mode, process.cwd(), '')
 const pwaDisabled = env.VITE_DISABLE_PWA === 'true'
 const proxy = {
   '/api': {
     target: env.API_PROXY_TARGET || 'http://127.0.0.1:5050',
     changeOrigin: true,
   },
 }
 return {
  resolve: {
    alias: {
      '@allmodelai/contracts': path.resolve(__dirname, '../typescript/src/index.ts'),
    },
  },
  plugins: [
    react(),
    VitePWA({
      disable: pwaDisabled,
      registerType: 'autoUpdate',
      injectRegister: false,
      includeAssets: [
        'gold-dragon.png',
        'favicon.svg',
        'aihub-dragon.svg',
        'pwa/apple-touch-icon.png',
      ],
      manifest: {
        name: 'AllModelAI',
        short_name: 'AllModelAI',
        description: 'Multi-model AI workspace',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait-primary',
        theme_color: PWA_THEME,
        background_color: PWA_BACKGROUND,
        icons: [
          {
            src: '/pwa/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/pwa/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/pwa/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [
          /^\/api(\/|$)/,
          /^\/auth(\/|$)/,
          /\/session(\/|$|\?)/,
          /\/models(\/|$|\?)/,
        ],
        cleanupOutdatedCaches: true,
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2,webmanifest}'],
        globIgnores: ['**/og-image.png', '**/gold_dragon_allModelAi*.png'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: API_PATH_PATTERN,
            handler: 'NetworkOnly',
          },
        ],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  server: {
    host: '0.0.0.0',
    proxy,
  },
  preview: { host: '0.0.0.0', proxy },
 }
})
