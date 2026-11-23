/**
 * 画面のテストで共通に使うもの。
 *
 * ■ test と expect
 * 各テストファイルは、@playwright/test ではなく、ここから test と expect を読み込む。
 * ここの test は、すべてのテストで「ページで JavaScript のエラーが起きていないか」を自動で確かめる。
 * テストごとに書き忘れることがなく、どの操作の途中でエラーが出ても見つけられる。
 *
 * ■ 時計
 * 時計を画面案と同じ「2026-11-19(木) 東京」から始めて開く。
 * サンプルPJTの開始日は「開いた日を含む週の月曜」なので 2026-11-16 になり、
 * 画面案・docs/test-cases.md 1章と同じ日程・カードの値になる。
 */

import { expect, test as base, type Page } from '@playwright/test';

export { expect };

/** 画面案の「今」。2026-11-19(木) 10:00 東京 */
const MOCKUP_NOW = new Date('2026-11-19T10:00:00+09:00');

/**
 * すべてのテストで使う test。
 *
 * Playwright の「フィクスチャ」という仕組みで、テストの前後に決まった処理をはさむ。
 * auto: true にすると、テストの中で使わなくても毎回動く。
 * use() の前がテストの前、use() の後がテストの後に動く。
 */
export const test = base.extend<{ failOnPageError: void }>({
  failOnPageError: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await use();
      expect(errors, 'ページで JavaScript のエラーが起きた').toEqual([]);
    },
    { auto: true },
  ],
});

/**
 * 時計を画面案の日に合わせてから開く。毎回まっさらなブラウザなので、保存データはなくサンプルPJTで始まる。
 *
 * clock.install は、ページの時計（Date・setTimeout など）を Playwright が動かせる時計に差し替える。
 * 時間はふつうに流れるが、clock.fastForward で先へ進められる。
 * ハイライトが消えるまでの 1.5 秒などを、実際に待たずに確かめるために使う。
 *
 * @param url 開く URL。省略すると開発サーバーの画面（/）。ビルドした dist/index.html は file:// の URL を渡す
 */
export async function openOnMockupDay(page: Page, url = '/') {
  await page.clock.install({ time: MOCKUP_NOW });
  await page.goto(url);
  // 書体（Google Fonts）が後から読み込まれると、文字の高さが変わって部品の位置がずれる。
  // 位置を比べるテストがあるので、書体の読み込みが終わるまで待つ
  await page.evaluate(() => document.fonts.ready);
}

/**
 * 画面が正しく開けたこと。開発サーバーと file:// の両方で使う（tasks.md 段階0 の完了条件）
 * - タイトルと、React が描いた画面がある
 * - tokens.css が読み込まれ、背景が DESIGN.md の background になっている
 * - 画面の大きさが 1512 × 982（等倍）になっている
 */
export async function expectAppOpens(page: Page) {
  await expect(page).toHaveTitle('Tsumikiri（工数ガント）');
  await expect(page.locator('#root > main')).toBeAttached();
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(246, 247, 249)');
  expect(page.viewportSize()).toEqual({ width: 1512, height: 982 });
  expect(await page.evaluate(() => window.devicePixelRatio)).toBe(1);
}

/** 行（data-testid="row-<ID>"） */
export const row = (page: Page, label: string) => page.getByTestId(`row-${label}`);
