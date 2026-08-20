import { defineConfig } from 'vite'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { existsSync, readFileSync } from 'node:fs'

// dev 专用：复用本机 OpenCode 已完成的 COROS MCP 授权（~/.local/share/opencode/mcp-auth.json），
// 避免开发调试反复走 OAuth 授权流程。仅 dev server 存在此中间件，生产构建无此端点，
// 正式环境仍走完整 OAuth 授权。
function devCorosAuth(): Plugin {
  return {
    name: 'dev-coros-auth',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url === '/__dev/coros-auth') {
          try {
            const home = process.env.HOME || ''
            const f = `${home}/.local/share/opencode/mcp-auth.json`
            if (!existsSync(f)) {
              res.statusCode = 404
              res.end(JSON.stringify({ error: 'no opencode coros auth' }))
              return
            }
            const all = JSON.parse(readFileSync(f, 'utf-8')) as Record<string, unknown>
            const coros = all.coros as
              | { tokens?: { accessToken?: string; refreshToken?: string; expiresAt?: number }; clientInfo?: { clientId?: string } }
              | undefined
            if (!coros?.tokens?.accessToken || !coros?.clientInfo?.clientId) {
              res.statusCode = 404
              res.end(JSON.stringify({ error: 'opencode coros auth incomplete' }))
              return
            }
            res.setHeader('Content-Type', 'application/json;charset=utf-8')
            res.end(JSON.stringify({
              clientId: coros.clientInfo.clientId,
              tokens: {
                accessToken: coros.tokens.accessToken,
                refreshToken: coros.tokens.refreshToken,
                expiresAt: coros.tokens.expiresAt,
              },
            }))
          } catch {
            res.statusCode = 500
            res.end(JSON.stringify({ error: 'failed to read opencode coros auth' }))
          }
          return
        }
        next()
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    devCorosAuth(),
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
