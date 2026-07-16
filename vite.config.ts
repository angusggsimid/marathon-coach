import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      // Include public assets in SW precache; PNG icons required for install
      includeAssets: [
        'favicon.svg',
        'races.json',
        'pwa-192x192.png',
        'pwa-512x512.png',
        'pwa-512x512-maskable.png',
        'apple-touch-icon.png',
      ],
      manifest: {
        name: '马拉松备赛 · AI 训练计划',
        short_name: '马拉松备赛',
        description: '填写目标赛事与成绩，30秒生成专属马拉松训练计划',
        theme_color: '#000000',
        background_color: '#000000',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        lang: 'zh-CN',
        icons: [
          {
            src: '/pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/pwa-512x512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
          {
            src: '/favicon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any',
          },
        ],
      },
      workbox: {
        // Cache static assets with CacheFirst; API data with NetworkFirst
        runtimeCaching: [
          {
            urlPattern: /\/races\.json$/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'races-data',
              expiration: { maxAgeSeconds: 60 * 60 * 24 * 7 }, // 7 days
            },
          },
        ],
      },
    }),
  ],
  server: {
    proxy: {
      // Forward /api/* to the crawler server during development.
      // RaceTab falls back to seed data if the crawler server isn't running.
      '/api': { target: 'http://localhost:3333', changeOrigin: true },
    },
  },
})
