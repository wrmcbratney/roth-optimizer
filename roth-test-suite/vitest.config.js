import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Engine is DOM-free (Option A extraction), so no jsdom needed.
    environment: 'node',
    include: ['tests/**/*.test.js'],
  },
});
