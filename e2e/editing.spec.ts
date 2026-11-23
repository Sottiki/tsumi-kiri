/**
 * 一覧での編集（tasks.md 段階5）の画面のテスト。
 *
 * サンプルPJT（docs/test-cases.md 1章）の「1-2 要件定義書作成」の工数を 3.0 → 1.0 にすると、
 * 後ろのタスクがすべて 2 稼働日早まる：
 * - 1-2 の終了日：11/20 → 11/18
 * - 完了予定（通常 8h）：1/4(月) → 12/30(水)。エンド日 12/25 を 5 → 3 営業日超過
 * - 総工数：33.5 → 31.5 人日
 */

import { expect, test, type Page } from '@playwright/test';
import { openOnMockupDay, row } from './helpers';

test.use({ timezoneId: 'Asia/Tokyo' });

/** 日程が変わった終了日のハイライトの色（DESIGN.md の flash #FFE58F） */
const FLASH = 'rgb(255, 229, 143)';

const effortOf = (page: Page) => page.getByLabel('要件定義書作成の工数（人日）');
const normalCard = (page: Page) => page.getByTestId('完了予定（通常 8h）');
const summary = (page: Page) => page.getByRole('region', { name: 'PJTの概要' });

test('工数を変えると、後ろのタスクの日程とカードが変わり、Ctrl+Z で元に戻る', async ({ page }) => {
  await openOnMockupDay(page);
  await expect(normalCard(page)).toContainText('1/4(月)');

  // --- 工数を 3.0 → 1.0 にする ---
  await effortOf(page).fill('1.0');

  // 1-2 の終了日と、後ろのタスク（5-1）の終了日が早まる
  await expect(row(page, '1-2')).toContainText('11/18');
  await expect(row(page, '5-1')).toContainText('12/30');
  // カード
  await expect(summary(page)).toContainText('31.5人日');
  await expect(normalCard(page)).toContainText('12/30(水)');
  await expect(normalCard(page)).toContainText('エンド日を 3 営業日超過');
  // 日程が変わった終了日が光る。日程の変わらない前のタスク（1-1）は光らない
  await expect(page.getByTestId('end-date-1-2')).toHaveCSS('background-color', FLASH);
  await expect(page.getByTestId('end-date-5-1')).toHaveCSS('background-color', FLASH);
  await expect(page.getByTestId('end-date-1-1')).not.toHaveCSS('background-color', FLASH);
  // 約1.5秒たつと、ハイライトが消える（0.8秒かけて戻る）
  await expect(page.getByTestId('end-date-1-2')).not.toHaveCSS('background-color', FLASH, {
    timeout: 5000,
  });

  // --- 欄を離れてから Ctrl+Z：元の日程に戻る ---
  await effortOf(page).press('Enter');
  await page.keyboard.press('Control+z');
  await expect(effortOf(page)).toHaveValue('3.0');
  await expect(row(page, '1-2')).toContainText('11/20');
  await expect(summary(page)).toContainText('33.5人日');
  await expect(normalCard(page)).toContainText('1/4(月)');

  // --- Ctrl+Shift+Z：やり直す ---
  await page.keyboard.press('Control+Shift+z');
  await expect(effortOf(page)).toHaveValue('1.0');
  await expect(normalCard(page)).toContainText('12/30(水)');
});

test('正しくない値は反映せず、欄を離れると今の値に戻る', async ({ page }) => {
  await openOnMockupDay(page);

  // 工数：小数2桁は反映しない
  await effortOf(page).fill('1.25');
  await expect(summary(page)).toContainText('33.5人日');
  await effortOf(page).blur();
  await expect(effortOf(page)).toHaveValue('3.0');

  // 工数：「2」を打つと反映され、離れると「2.0」の形に整う
  await effortOf(page).fill('2');
  await expect(summary(page)).toContainText('32.5人日');
  await effortOf(page).blur();
  await expect(effortOf(page)).toHaveValue('2.0');

  // 進捗率：100 を超える値は反映しない
  const progress = page.getByLabel('要件定義書作成の進捗率（%）');
  await progress.fill('120');
  await progress.blur();
  await expect(progress).toHaveValue('60');
  // 進捗率：100 にすると完了になる
  await progress.fill('100');
  await expect(row(page, '1-2')).toContainText('完了');
});

test('入力欄にカーソルがあるときの Ctrl+Z は、ストアを戻さない', async ({ page }) => {
  await openOnMockupDay(page);
  await page.getByLabel('PJT名').fill('別の名前');
  await page.getByLabel('PJT名').blur();

  // 工数の欄にカーソルを置いたまま Ctrl+Z を押しても、PJT名は戻らない（ブラウザの入力欄の取り消しに任せる）
  await effortOf(page).focus();
  await page.keyboard.press('Control+z');
  await expect(page.getByLabel('PJT名')).toHaveValue('別の名前');
});

test('PJT名・開始日・エンド日を変えられる', async ({ page }) => {
  await openOnMockupDay(page);
  const name = page.getByLabel('PJT名');
  const start = page.getByLabel('開始日');
  const end = page.getByLabel('エンド日');

  // PJT名：空にしても反映せず、離れると最後の名前に戻る
  await name.fill('基幹システム更改');
  await name.fill('');
  await name.blur();
  await expect(name).toHaveValue('基幹システム更改');

  // エンド日を 1/8 にすると、通常 8h の完了予定（1/4）が間に合う
  await end.fill('2027-01-08');
  await expect(normalCard(page)).toContainText('エンド日に間に合う');

  // エンド日を空にすると、エンド日未設定になる
  await end.fill('');
  await expect(normalCard(page)).toContainText('エンド日未設定');

  // 開始日を1週間後ろにすると、完了予定も1週間後ろになる（1/4(月) → 1/12(火)。1/11 は成人の日）
  await start.fill('2026-11-23');
  await expect(normalCard(page)).toContainText('1/12(火)');
  // 範囲の外の年（2025年）は反映せず、離れると今の日付に戻る
  await start.fill('2025-11-23');
  await start.blur();
  await expect(start).toHaveValue('2026-11-23');
});

test('＋タスク追加と工程の帯の「＋」で、タスクを足せる', async ({ page }) => {
  await openOnMockupDay(page);

  // 「＋ タスク追加」：開いているタスクがないので、最初の工程（要件定義）の末尾に足す
  await page.getByRole('button', { name: '＋ タスク追加' }).click();
  await expect(row(page, '1-3')).toContainText('新しいタスク');
  await expect(page.getByLabel('新しいタスクの工数（人日）')).toHaveValue('1.0');
  await expect(summary(page)).toContainText('34.5人日');

  // 工程の帯の「＋」：その工程（リリース）の末尾に足す。表の下の方なので、見えるまでスクロールする
  await page.getByRole('button', { name: 'リリースにタスクを追加' }).click();
  await expect(row(page, '5-2')).toContainText('新しいタスク');
  await expect(row(page, '5-2')).toBeInViewport();
  await expect(summary(page)).toContainText('35.5人日');

  // 追加も Ctrl+Z で戻せる
  await page.keyboard.press('Control+z');
  await expect(row(page, '5-2')).toHaveCount(0);
});
