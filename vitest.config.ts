import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    root: '.',
    include: ['server/src/**/*.test.ts'],
    globals: true,
    testTimeout: 15000,
    coverage: {
      provider: 'v8',
      include: [
        'server/src/db/repositories/**',
        'server/src/services/ai/contextBuilder.ts',
        'server/src/services/ai/promptBuilder.ts',
        'server/src/utils/textOperations.ts',
        'server/src/validation.ts',
      ],
      exclude: [
        'server/src/db/repositories/__tests__/**',
      ],
      reporter: ['text', 'text-summary'],
    },
  },
});
