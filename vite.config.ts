/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

/*
 * GitHub Pages serves a project site from a sub-path (/Fretboard-Atlas/), not
 * from the root. Set only for that build, so the dev server and `vite preview`
 * keep working at "/" — a sub-path locally buys nothing and just makes every
 * hand-typed URL longer. The workflow sets the flag.
 *
 * src/audio.ts already builds its sample URLs from import.meta.env.BASE_URL, so
 * the recordings follow this without further work.
 */
const base = process.env.GITHUB_PAGES === 'true' ? '/Fretboard-Atlas/' : '/'

// https://vite.dev/config/
export default defineConfig({
  base,
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
        // --dark-bg. These paint the OS chrome around an installed app, so they
        // belong to the PAGE, not to a surface on it. They used to carry the old
        // --dark-panel-sunken, a token that no longer exists — and a sunken panel
        // was never the right thing to match anyway.
        background_color: '#171614',
        theme_color: '#171614',
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
        // mp3 and the manifest carry the guitar recordings — without them an offline
        // visit would fall back to the synthesised string for good.
        globPatterns: ['**/*.{js,css,html,png,svg,woff2,mp3}', 'samples/manifest.json'],
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
