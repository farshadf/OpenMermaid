import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@components': new URL('./src/components', import.meta.url).pathname,
      '@content': new URL('./src/content', import.meta.url).pathname,
      '@features': new URL('./src/features', import.meta.url).pathname,
      '@lib': new URL('./src/lib', import.meta.url).pathname,
      '@styles': new URL('./src/styles', import.meta.url).pathname,
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/unit/**/*.test.ts', 'tests/unit/**/*.test.tsx'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/lib/**/*.ts', 'src/features/**/*.ts', 'src/features/**/*.tsx'],
      exclude: [
        'src/features/**',
        'src/lib/**/index.ts',
        'src/lib/browser/**',
        'src/lib/rendering/export.ts',
        'src/lib/rendering/frame-runtime.ts',
        'src/lib/rendering/viewport.ts',
        'src/lib/performance/bootstrap.ts',
        'src/lib/performance/measure.ts',
      ],
      thresholds: {
        statements: 80,
        branches: 75,
        functions: 80,
        lines: 80,
      },
    },
  },
});
