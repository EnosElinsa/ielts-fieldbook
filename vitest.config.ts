import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: false,
    include: ['tests/domain/**/*.test.ts', 'src/**/*.{test,spec}.{ts,tsx}'],
  },
});
