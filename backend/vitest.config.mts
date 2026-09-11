import { defineConfig } from 'vitest/config';

// Scopes Vitest to the backend package; without this it would look for a root config.
export default defineConfig({
  test: {
    include: ['test/**/*.test.js'],
  },
});
