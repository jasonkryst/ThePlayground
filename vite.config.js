/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Default globPatterns exclude audio; every game's sound clips (mp3/wav)
      // and images (png/webp) are precached too so a game already visited
      // once keeps working fully offline, not just the app shell.
      // skipWaiting/clientsClaim pair with registerType: 'autoUpdate' so a
      // new service worker activates and takes control of already-open tabs
      // immediately, with no reload required for the silent update to land.
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,woff2,mp3,wav}'],
        skipWaiting: true,
        clientsClaim: true,
      },
      manifest: {
        name: 'The Playground',
        short_name: 'Playground',
        description: 'A browser-based game dashboard for infants and toddlers.',
        start_url: '/',
        display: 'standalone',
        theme_color: '#006C7A',
        background_color: '#F0FDFF',
        icons: [
          { src: '/pwa-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  server: {
    watch: {
      usePolling: true,
      interval: 300,
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test-setup.js',
    exclude: ['node_modules/**', 'e2e/**', '.claude/**'],
    coverage: {
      include: ['src/**'],
    },
  },
})
