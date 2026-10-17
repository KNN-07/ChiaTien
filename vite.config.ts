import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'ChiaTiền – Chia tiền đi chơi',
        short_name: 'ChiaTiền',
        description: 'Chia tiền chuyến đi, đa tiền tệ, quét hóa đơn bằng Gemma',
        theme_color: '#18181b',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: './',
        scope: './',
        icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }],
      },
      workbox: { navigateFallback: 'index.html', globPatterns: ['**/*.{js,css,html,svg,woff2}'] },
    }),
  ],
  test: { environment: 'node' },
});
