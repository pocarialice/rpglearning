import { defineConfig } from 'vitest/config'
export default defineConfig({
  test: {
    setupFiles: ['tests/helpers/vitest.setup.js'],
    restoreMocks: true,
    projects: [
      { extends: true, test: { name: 'functions', include: ['tests/unit/functions/**/*.test.js'], environment: 'node' } },
      { extends: true, test: { name: 'web', include: ['tests/unit/web/**/*.test.js'], environment: 'jsdom' } }
    ],
    coverage: {
      provider: 'v8',
      include: ['functions/**/*.{js,mjs}', 'web/js/core/**', 'web/js/logic/**'],
      exclude: ['web/js/pages/**', 'web/js/components/**'],
      reporter: ['text', 'json-summary', 'html'],
      thresholds: {
        'functions/shared/domain/**': { statements: 100, branches: 100 },
        'web/js/logic/validators.js': { statements: 100, branches: 100 },
        'functions/**': { statements: 90, branches: 80 },
        'web/js/**': { statements: 90, branches: 80 }
      }
    }
  }
})
