import { defineConfig, devices } from '@playwright/test';

// 画面のテスト。開発サーバーの画面と、ビルドした dist/index.html（file://）を開いて確かめる
export default defineConfig({
  testDir: 'e2e',
  // ファイルの中のテストも、ばらばらの worker で同時に流す。
  // 既定（false）では、1つのファイルのテストは1つの worker で順に流れるので、
  // テストの多いファイル（editing.spec.ts など）が全体の待ち時間を決めてしまう。
  // テストは毎回まっさらなブラウザで開くので、同時に流しても互いに影響しない
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://localhost:5173',
    // MacBook の画面（3024 × 1964）のレイアウト上の大きさ。等倍
    viewport: { width: 1512, height: 982 },
    deviceScaleFactor: 1,
    // 日付は東京の時刻で見る（時計は e2e/helpers.ts の openOnMockupDay で画面案の日に合わせる）
    timezoneId: 'Asia/Tokyo',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run dev -- --strictPort',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
  },
});
