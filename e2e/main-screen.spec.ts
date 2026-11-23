/**
 * メイン画面の表示（tasks.md 段階4）の画面のテスト。
 *
 * 時計を画面案と同じ「2026-11-19(木) 東京」に止めて開く。
 * サンプルPJTの開始日は「開いた日を含む週の月曜」なので 2026-11-16 になり、
 * 画面案・docs/test-cases.md 1章と同じ日程・カードの値になる。
 */

import { expect, test, type Page } from '@playwright/test';

test.use({ timezoneId: 'Asia/Tokyo' });

/** 時計を止めてから開く。毎回まっさらなブラウザなので、保存データはなくサンプルPJTで始まる */
async function openOnMockupDay(page: Page) {
  await page.clock.setFixedTime(new Date('2026-11-19T10:00:00+09:00'));
  await page.goto('/');
  // 書体（Google Fonts）が後から読み込まれると、文字の高さが変わって部品の位置がずれる。
  // 位置を比べるテストがあるので、書体の読み込みが終わるまで待つ
  await page.evaluate(() => document.fonts.ready);
}

/** 行（data-testid="row-<ID>"） */
const row = (page: Page, label: string) => page.getByTestId(`row-${label}`);

test('サンプルPJTの工程・タスク・カードが表示される', async ({ page }) => {
  await openOnMockupDay(page);

  // --- ヘッダ ---
  await expect(page.getByLabel('PJT名')).toHaveValue('社内ポータル刷新');
  await expect(page.getByLabel('開始日')).toHaveValue('2026-11-16');
  await expect(page.getByLabel('エンド日')).toHaveValue('2026-12-25');

  // --- カード（test-cases.md TC-04） ---
  const cards = page.getByRole('region', { name: 'PJTの概要' });
  await expect(cards).toContainText('33.5人日');
  await expect(cards).toContainText('残工数 29.7 人日（進捗 16%）');
  await expect(cards).toContainText('今日から 25 営業日');
  const normal = page.getByTestId('完了予定（通常 8h）');
  await expect(normal).toContainText('1/4(月)');
  await expect(normal).toContainText('エンド日を 5 営業日超過');
  const overtime = page.getByTestId('完了予定（残業 10h）');
  await expect(overtime).toContainText('12/23(水)');
  await expect(overtime).toContainText('エンド日に間に合う');
  await expect(overtime).toContainText('残業なら 7 営業日短縮');

  // --- 工程とタスク：工程5本 ＋ タスク13件 ---
  await expect(page.locator('[data-testid^="row-"]')).toHaveCount(18);
  for (const [label, name] of [
    ['1', '要件定義'],
    ['2', '設計'],
    ['3', '実装'],
    ['4', 'テスト'],
    ['5', 'リリース'],
  ]) {
    await expect(row(page, label as string)).toContainText(name as string);
  }
  await expect(row(page, '2-1')).toContainText('基本設計');
  await expect(row(page, '2-1')).toContainText('2'); // 子の数

  // 末端の行：工数・進捗率・終了日・状態（test-cases.md TC-01・TC-03）
  await expect(page.getByLabel('要件定義書作成の工数（人日）')).toHaveValue('3.0');
  await expect(page.getByLabel('要件定義書作成の進捗率（%）')).toHaveValue('60');
  await expect(row(page, '1-2')).toContainText('進行中');
  await expect(row(page, '5-1')).toContainText('1/4');
  await expect(row(page, '5-1')).toContainText('超過');
  // 期日（12/25）を超えた 5-1 にだけ炎、メモのある 1-2 と 5-1 にメモのアイコン
  await expect(page.getByRole('img', { name: '期日超過' })).toHaveCount(1);
  await expect(row(page, '5-1').getByRole('img', { name: '期日超過' })).toBeVisible();
  await expect(page.getByRole('img', { name: 'メモあり' })).toHaveCount(2);

  // --- ガントの見出し：今日（11/19 は開始日から4日目）は濃い黄色、エンド日（40日目）の右に赤線 ---
  const dateHeads = page.getByTestId('date-head-row').locator('> div');
  await expect(dateHeads.nth(3)).toHaveText('19');
  await expect(dateHeads.nth(3)).toHaveCSS('background-color', 'rgb(255, 233, 163)');
  await expect(dateHeads.nth(7)).toHaveText('休'); // 11/23 勤労感謝の日
  await expect(dateHeads.nth(39)).toHaveText('25');
  await expect(dateHeads.nth(39)).toHaveCSS('border-right', '2px solid rgb(217, 45, 32)');
});

test('スクロールしても、見出しは上に、タスク表は左に固定される', async ({ page }) => {
  await openOnMockupDay(page);
  const scroll = page.getByTestId('board-scroll');
  const header = page.getByText('工程 / タスク');
  const card = row(page, '4-2').getByText('受入テスト対応');
  const firstDateHead = page.getByTestId('date-head-row').locator('> div').first();

  const headerBefore = await header.boundingBox();
  const cardBefore = await card.boundingBox();
  const dateHeadBefore = await firstDateHead.boundingBox();

  // 縦横にスクロールする
  await scroll.evaluate((element) => {
    element.scrollTop = 80;
    element.scrollLeft = 300;
  });
  await expect.poll(() => scroll.evaluate((element) => element.scrollLeft)).toBe(300);
  await expect.poll(() => scroll.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);

  // 見出しは縦にも横にも動かない（左上の角）
  expect(await header.boundingBox()).toEqual(headerBefore);
  // タスク表のカードは、縦には動くが、横には動かない
  const cardAfter = await card.boundingBox();
  expect(cardAfter?.x).toBe(cardBefore?.x);
  expect(cardAfter?.y).toBeLessThan(cardBefore?.y ?? 0);
  // ガントの日付の見出しは、横には動くが、縦には動かない
  const dateHeadAfter = await firstDateHead.boundingBox();
  expect(dateHeadAfter?.y).toBe(dateHeadBefore?.y);
  expect(dateHeadAfter?.x).toBeLessThan(dateHeadBefore?.x ?? 0);
});

test('親タスクをたたむと子の行が隠れ、広げると戻る', async ({ page }) => {
  await openOnMockupDay(page);
  const collapse = page.getByRole('button', { name: '基本設計の子タスクをたたむ' });
  await expect(collapse).toHaveAttribute('aria-expanded', 'true');

  await collapse.click();
  await expect(row(page, '2-1-1')).toHaveCount(0);
  await expect(row(page, '2-1-2')).toHaveCount(0);
  await expect(row(page, '2-2')).toBeVisible(); // 兄弟は残る
  // たたんでも日程は変わらない（SPEC 3.1）
  await expect(row(page, '2-1')).toContainText('11/30'); // 2-1-2 の終了日（TC-01）

  const expand = page.getByRole('button', { name: '基本設計の子タスクを広げる' });
  await expect(expand).toHaveAttribute('aria-expanded', 'false');
  await expand.click();
  await expect(row(page, '2-1-1')).toBeVisible();
  await expect(row(page, '2-1-2')).toBeVisible();
});

test('通常／残業を切り替えると、表の日程が変わる', async ({ page }) => {
  await openOnMockupDay(page);
  const normalButton = page.getByRole('button', { name: '通常 8h' });
  const overtimeButton = page.getByRole('button', { name: '残業 10h' });
  await expect(normalButton).toHaveAttribute('aria-pressed', 'true');

  // 通常：5-1 は 1/4 に終わり、エンド日を超える
  await expect(row(page, '5-1')).toContainText('1/4');
  await expect(row(page, '5-1')).toContainText('超過');

  // 残業：5-1 は 12/23 に終わり、エンド日に間に合う（test-cases.md TC-01）
  await overtimeButton.click();
  await expect(overtimeButton).toHaveAttribute('aria-pressed', 'true');
  await expect(row(page, '5-1')).toContainText('12/23');
  await expect(row(page, '5-1')).toContainText('未着手');
  await expect(row(page, '5-1')).not.toContainText('超過');
});
