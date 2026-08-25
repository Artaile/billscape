import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'logo.svg'],
      workbox: {
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, // 5 MiB
      },
      manifest: {
        name: 'BillScape — Smart Billing POS',
        short_name: 'BillScape',
        description: 'Multi-tenant billing and inventory management',
        theme_color: '#0a0a0a',
        background_color: '#0a0a0a',
        display: 'standalone',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@billscape/api': path.resolve(__dirname, '../../packages/api/src/index.ts'),
      '@billscape/core': path.resolve(__dirname, '../../packages/core/src/index.ts'),
    },
  },
  build: {
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          query: ['@tanstack/react-query', '@supabase/supabase-js'],
          ui: ['lucide-react'],
          charts: ['recharts'],
          export: ['xlsx', 'qrcode', 'jsbarcode'],
        },
      },
    },
  },
  server: {
    port: 5173,
    open: true,
  },
})
