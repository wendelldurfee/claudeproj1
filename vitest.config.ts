import { defineConfig } from 'vitest/config';
import path from 'node:path';

// Only src/core is unit tested: it is deliberately free of React Native imports
// so the exam engine can run in plain Node.
export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  test: {
    environment: 'node',
    include: ['__tests__/**/*.test.ts'],
  },
});
