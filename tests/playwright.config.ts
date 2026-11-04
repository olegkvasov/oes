import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './e2e',
  outputDir: './.artifacts/results',
  reporter: [['list'], ['html', { outputFolder: 'tests/.artifacts/report', open: 'never' }]],
  use: { baseURL: 'http://127.0.0.1:5173' },
  webServer: [
    {
      command: 'yarn mock',
      cwd: process.cwd(),
      env: { TEST_CONTROL: '1' },
      url: 'http://127.0.0.1:3001/api/me',
      reuseExistingServer: false,
    },
    {
      command: 'yarn dev',
      cwd: process.cwd(),
      env: { VITE_E2E: '1' },
      url: 'http://127.0.0.1:5173',
      reuseExistingServer: false,
    },
  ],
});
