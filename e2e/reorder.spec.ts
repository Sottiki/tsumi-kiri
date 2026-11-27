/**
 * ドラッグでの並べ替え（tasks.md 段階7）の画面のテスト。
 *
 * サンプルPJT（docs/test-cases.md 1章）の設計の工程を使う：
 *   2-1  基本設計（親）  11/24 → 11/30
 *   2-1-1  画面設計      11/24 → 11/26
 *   2-1-2  DB設計        11/27 → 11/30
 *   2-2  詳細設計        12/1  → 12/4
 *
 * 詳細設計を基本設計の前へ動かすと（TC-42）、ID が振り直され、日程も組み直される：
 *   2-1  詳細設計  11/24 → 11/27（4.0 人日。11/23 は祝日）
 *   2-2  基本設計（子の 画面設計 が 2-2-1、DB設計 が 2-2-2）
 *   2-2-1  画面設計  11/30 → 12/2
 * 工程の終わり（12/4）は変わらないので、後ろの工程の日程とカードは変わらない。
 *
 * 並べ替えの計算（兄弟・落とす位置）は Vitest（tests/ui/reorder.test.ts）で確かめてあるので、
 * ここでは「マウスの操作が、線・薄くする行・ストアの並べ替えにつながっているか」を確かめる。
 */

import type { Page } from '@playwright/test';
import { expect, openOnMockupDay, row, test } from './helpers';

const panel = (page: Page) => page.getByRole('complementary', { name: 'タスクの詳細' });
const card = (page: Page, label: string) => page.getByTestId(`card-${label}`);
/** 落とす位置の青い線（Board.tsx の .dropLine。data-drop-row に線を引く行の id、data-drop-edge に上端か下端か） */
const dropLines = (page: Page) => page.locator('[data-drop-edge]');

/** 青い線が、ある行の上端（before）か下端（after）に1本だけ出ているか */
async function expectDropLine(page: Page, label: string, edge: 'before' | 'after') {
  const rowKey = await row(page, label).getAttribute('data-row-key');
  await expect(dropLines(page)).toHaveCount(1);
  await expect(dropLines(page)).toHaveAttribute('data-drop-row', rowKey ?? '');
  await expect(dropLines(page)).toHaveAttribute('data-drop-edge', edge);
  // 線の縦の位置が、その行の上端（下端）に合っている
  const line = await dropLines(page).boundingBox();
  const target = await row(page, label).boundingBox();
  if (line === null || target === null) throw new Error('線か行が画面にありません');
  const expected = edge === 'before' ? target.y : target.y + target.height;
  expect(Math.abs(line.y - expected)).toBeLessThanOrEqual(1);
}

/**
 * カードを掴んで、ある行の上端か下端の近くまで動かす（まだ離さない）。
 * 離すのは呼ぶ側で page.mouse.up() を行う。ドラッグ中の見た目を確かめられるようにするため。
 *
 * - 掴むのは、カードの左端の ID のあたり（真ん中には工数の入力欄があり、入力欄では掴めないため）
 * - steps：途中の位置を何回に分けて動かすか。dnd-kit は動いた距離（5px）でドラッグを始めるので、
 *   一度に飛ばさず、少しずつ動かす
 * - 行の上端・下端から 8px 内側を狙う。かたまりの上半分なら前、下半分なら後ろに落ちる（reorder.ts の gapAt）
 */
async function dragCardTo(page: Page, label: string, to: { row: string; edge: 'top' | 'bottom' }) {
  const from = await card(page, label).boundingBox();
  const target = await row(page, to.row).boundingBox();
  if (from === null || target === null) throw new Error('カードか行が画面にありません');

  const x = from.x + 16;
  const y = to.edge === 'top' ? target.y + 8 : target.y + target.height - 8;
  await page.mouse.move(x, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(x, y, { steps: 10 });
}

/** 設計の工程が、元の並び（基本設計 → 詳細設計）のままか */
async function expectOriginalOrder(page: Page) {
  await expect(card(page, '2-1')).toContainText('基本設計');
  await expect(card(page, '2-1-1')).toContainText('画面設計');
  await expect(card(page, '2-2')).toContainText('詳細設計');
  await expect(row(page, '2-2')).toContainText('12/1');
}

/** 詳細設計を基本設計の前へ動かした後の並びと日程（TC-42） */
async function expectMovedOrder(page: Page) {
  await expect(card(page, '2-1')).toContainText('詳細設計');
  await expect(row(page, '2-1')).toContainText('11/24');
  await expect(row(page, '2-1')).toContainText('11/27');
  await expect(card(page, '2-2')).toContainText('基本設計');
  // 基本設計の子も一緒に動き、ID が振り直される
  await expect(card(page, '2-2-1')).toContainText('画面設計');
  await expect(row(page, '2-2-1')).toContainText('11/30');
  await expect(row(page, '2-2-1')).toContainText('12/2');
  await expect(card(page, '2-2-2')).toContainText('DB設計');
}

test('タスクを上へドラッグすると、線が出て、離すと順番と日程が変わる。Ctrl+Z で戻る', async ({
  page,
}) => {
  await openOnMockupDay(page);
  await expectOriginalOrder(page);

  // 詳細設計を、基本設計の行の上端あたりまで動かす
  await dragCardTo(page, '2-2', { row: '2-1', edge: 'top' });
  // 落とす位置（基本設計の上端）に青い線が1本出る
  await expectDropLine(page, '2-1', 'before');
  // 元の場所の詳細設計のカードは薄くなる（DESIGN.md：不透明度 0.4）
  await expect(card(page, '2-2')).toHaveCSS('opacity', '0.4');

  await page.mouse.up();
  await expectMovedOrder(page);
  // 線と薄い表示は消える。落としたときのクリックで、詳細パネルは開かない
  await expect(dropLines(page)).toHaveCount(0);
  await expect(card(page, '2-1')).toHaveCSS('opacity', '1');
  await expect(panel(page)).toBeHidden();

  // 1回の並べ替えが、元に戻すの1件
  await page.keyboard.press('Control+z');
  await expectOriginalOrder(page);
});

test('親をドラッグすると、子もまとめて薄くなり、まとめて動く', async ({ page }) => {
  await openOnMockupDay(page);

  // 基本設計（子が2つ）を、詳細設計の行の下端あたりまで動かす
  await dragCardTo(page, '2-1', { row: '2-2', edge: 'bottom' });
  // 線は、詳細設計の下端に出る
  await expectDropLine(page, '2-2', 'after');
  // 親と子のカードがまとめて薄くなる
  for (const label of ['2-1', '2-1-1', '2-1-2']) {
    await expect(card(page, label)).toHaveCSS('opacity', '0.4');
  }
  await expect(card(page, '2-2')).toHaveCSS('opacity', '1');

  await page.mouse.up();
  // 結果は、詳細設計を前へ動かしたときと同じ
  await expectMovedOrder(page);
});

test('別の工程や別の階層の上で離しても、何も変わらない', async ({ page }) => {
  await openOnMockupDay(page);

  // 詳細設計を、要件定義の工程のタスク（1-1）の上へ動かす：線は出ない
  await dragCardTo(page, '2-2', { row: '1-1', edge: 'top' });
  await expect(dropLines(page)).toHaveCount(0);
  await page.mouse.up();
  await expectOriginalOrder(page);
  await expect(card(page, '1-1')).toContainText('現状ヒアリング');

  // 子の画面設計を、親の兄弟（詳細設計）の上へ動かす：別の階層なので線は出ない
  await dragCardTo(page, '2-1-1', { row: '2-2', edge: 'bottom' });
  await expect(dropLines(page)).toHaveCount(0);
  await page.mouse.up();
  await expectOriginalOrder(page);

  // 落とせない所で離したときも、詳細パネルは開かない
  await expect(panel(page)).toBeHidden();
});

test('ドラッグ中に Esc を押すと取りやめになり、開いていた詳細パネルは閉じない', async ({
  page,
}) => {
  await openOnMockupDay(page);
  // 詳細設計のパネルを開いておく（カードの ID のあたりを押す）
  await card(page, '2-2').click({ position: { x: 16, y: 10 } });
  await expect(panel(page)).toBeVisible();

  await dragCardTo(page, '2-2', { row: '2-1', edge: 'top' });
  await expect(dropLines(page)).toHaveCount(1);
  await page.keyboard.press('Escape');
  // 取りやめたので、線は消え、離しても並びは変わらない
  await expect(dropLines(page)).toHaveCount(0);
  await page.mouse.up();
  await expectOriginalOrder(page);
  // ドラッグの取りやめの Esc では、パネルは閉じない（SPEC 3.1：Esc では何も変わらない）
  await expect(panel(page)).toBeVisible();
});

test('工数の入力欄の上で押して動かしても、ドラッグにはならない', async ({ page }) => {
  await openOnMockupDay(page);
  const effort = page.getByLabel('詳細設計の工数（人日）');
  const box = await effort.boundingBox();
  const target = await row(page, '2-1').boundingBox();
  if (box === null || target === null) throw new Error('入力欄か行が画面にありません');

  // 入力欄の上で押して、基本設計の行まで動かす（入力欄では掴めない。決定事項73）
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, target.y + 8, { steps: 10 });
  await expect(dropLines(page)).toHaveCount(0);
  await page.mouse.up();
  await expectOriginalOrder(page);
});
