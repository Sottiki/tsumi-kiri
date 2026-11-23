import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { expect, test, type Page } from '@playwright/test';

const distHtml = fileURLToPath(new URL('../dist/index.html', import.meta.url));

// ページで起きたエラーを集める
function collectErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

async function expectAppOpens(page: Page) {
  await expect(page).toHaveTitle('Tsumikiri（工数ガント）');
  await expect(page.locator('#root > main')).toBeAttached();
  // tokens.css が読み込まれ、背景が DESIGN.md の background になっている
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(246, 247, 249)');
  expect(page.viewportSize()).toEqual({ width: 1512, height: 982 });
  expect(await page.evaluate(() => window.devicePixelRatio)).toBe(1);
}

test('開発サーバーの画面が開ける', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/');
  await expectAppOpens(page);
  expect(errors).toEqual([]);
});

test('ビルドした dist/index.html を file:// で開ける', async ({ page }) => {
  expect(existsSync(distHtml), '先に npm run build を行う').toBe(true);
  const errors = collectErrors(page);
  await page.goto(pathToFileURL(distHtml).href);
  await expectAppOpens(page);
  expect(errors).toEqual([]);
});
