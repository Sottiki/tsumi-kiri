import { defineConfig, devices } from '@playwright/test';

// 画面のテスト。開発サーバーの画面と、ビルドした dist/index.html（file://）を開いて確かめる
export default defineConfig({
  testDir: 'e2e',
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://localhost:5173',
    // MacBook の画面（3024 × 1964）のレイアウト上の大きさ。等倍
    viewport: { width: 1512, height: 982 },
    deviceScaleFactor: 1,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run dev -- --strictPort',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
  },
});
