/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // Ship a new version without the user having to know: the app is a lookup
      // tool, there is no unsaved work a reload could destroy.
      registerType: 'autoUpdate',

      manifest: {
        name: 'Fretboard Atlas — Skalen und Akkorde',
        // What actually fits under a home-screen icon.
        short_name: 'Atlas',
        description:
          'Tonarten auf dem Gitarrengriffbrett sichtbar machen: Skalen, Lagen, leitereigene Akkorde und Griffe.',
        lang: 'de',
        start_url: '.',
        scope: '.',
        display: 'standalone',
        orientation: 'any',
        background_color: '#1b1a18',
        theme_color: '#1b1a18',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          // Android crops icons to its own shape; this one has padding to survive it.
          {
            src: 'icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },

      workbox: {
        // The whole app is a handful of static files and computes everything
        // client-side, so precaching it makes it work with no network at all.
        globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
      },
    }),
  ],
  test: {
    // Theory tests stay on fast node; component tests opt into jsdom per file
    // via a `// @vitest-environment jsdom` docblock.
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['src/test/setup.ts'],
  },
})
