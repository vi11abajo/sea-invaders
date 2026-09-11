import { defineConfig } from 'vitest/config';

// Scopes Vitest to the backend package; without this it would look for a root config.
export default defineConfig({
  test: {
    include: ['test/**/*.test.js'],
    // Every test runs with NODE_ENV=test so the app skips morgan request logging (see createApp.js).
    env: { NODE_ENV: 'test' },
  },
});
