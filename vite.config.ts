/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// Must match the GitHub repository name — the app is served from
// https://<user>.github.io/<REPO>/
const REPO = 'hours'

export default defineConfig({
  base: `/${REPO}/`,
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Hours',
        short_name: 'Hours',
        description: 'Personal work-hours tracker',
        start_url: `/${REPO}/`,
        scope: `/${REPO}/`,
        display: 'standalone',
        theme_color: '#f8fafc',
        background_color: '#f8fafc',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        // index.html is precached by the glob above; stale HTML can never
        // reference vanished hashed chunks.
      },
    }),
  ],
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
})
