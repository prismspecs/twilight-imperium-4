// Dedicated vitest config for the AsyncTI4 dataset toolkit.
// The main repo config only includes src/**; run these tests with:
//   npx vitest run --config tools/ti4dataset/vitest.config.ts
// or via the `test:dataset` npm script.
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tools/ti4dataset/**/*.test.ts'],
    environment: 'node',
    testTimeout: 30000,
  },
})
