import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@ezygrid/model': path.resolve(__dirname, 'packages/model/src/index.ts'),
      '@ezygrid/formula': path.resolve(__dirname, 'packages/formula/src/index.ts'),
      '@ezygrid/core': path.resolve(__dirname, 'packages/core/src/index.ts'),
      '@ezygrid/csv': path.resolve(__dirname, 'packages/csv/src/index.ts'),
      '@ezygrid/xlsx': path.resolve(__dirname, 'packages/xlsx/src/index.ts'),
    },
  },
  test: {
    include: ['packages/*/tests/**/*.test.ts'],
    environment: 'node',
  },
});
