import { defineConfig } from 'vitest/config';

// Keeps Vitest scoped to the core package: without this file it walks up and
// loads the repository root's vite.config.js, which needs the web game's deps.
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
  },
});
