/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// file:// でも GitHub Pages でも開けるよう、相対パスで1つの HTML にまとめる
export default defineConfig({
  base: './',
  plugins: [react(), viteSingleFile()],
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
