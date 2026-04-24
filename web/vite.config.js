import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    svelte()
  ],
  base: '/passive-design-helper/',
  build: {
    outDir: 'dist',
    rollupOptions: {
      output: {
        manualChunks: {
          chartjs: ['chart.js', 'svelte5-chartjs', 'chartjs-adapter-date-fns'],
          leaflet: ['leaflet'],
          psychrolib: ['psychrolib']
        }
      }
    }
  }
});