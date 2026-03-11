/// <reference types="vitest" />
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  plugins: [
    svelte({ hot: !process.env.VITEST })
  ],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/tests/setup.js'],
    include: ['src/tests/**/*.{test,spec}.js'],
    alias: {
      '$lib': '/home/a/Documents/Projets/passive-design-tactics/web/src'
    },
    environmentOptions: {
      svelte: {
        compileOptions: {
          dev: true
        }
      }
    }
  },
  resolve: {
    conditions: ['browser', 'development']
  }
});
