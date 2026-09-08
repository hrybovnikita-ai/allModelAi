import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import process from 'node:process'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
 const env = loadEnv(mode, process.cwd(), '')
 const proxy = {
   '/api': {
     target: env.API_PROXY_TARGET || 'http://127.0.0.1:5050',
     changeOrigin: true,
   },
 }
 return {
  plugins: [react()],
  server: {
    proxy,
  },
  preview: { proxy },
 }
})
