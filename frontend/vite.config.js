import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    cssCodeSplit: true,
    target: 'esnext',
    minify: 'esbuild',
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          supabase: ['@supabase/supabase-js'],
          recharts: ['recharts'],
          qrcode: ['qrcode', 'jsqr'],
        },
      },
    },
    chunkSizeWarningLimit: 600,
  },
  // modern esbuild, faster HMR also helps Lighthouse dev-server
})
