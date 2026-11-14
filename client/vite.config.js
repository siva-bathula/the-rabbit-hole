import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  if (mode === 'production' && !String(env.VITE_FIREBASE_MEASUREMENT_ID ?? '').trim()) {
    console.warn(
      '[vite] VITE_FIREBASE_MEASUREMENT_ID is missing — this build will not send Firebase / GA4 analytics.',
    )
  }

  return {
  plugins: [react()],
  build: {
    outDir: '../server/public',
    emptyOutDir: true,
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
  }
})
