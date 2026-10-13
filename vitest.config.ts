import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { 'virtual:vocabulary-manifest': path.resolve(__dirname, 'tests/vocabularyManifestUrl.ts') } },
  test: {
    environment: 'jsdom',
    maxWorkers: 4,
    minWorkers: 1,
    setupFiles: ['tests/vocabularyTeachingSetup.ts'],
    globals: false,
    include: ['tests/**/*.test.ts', 'src/**/*.{test,spec}.{ts,tsx}'],
  },
});
