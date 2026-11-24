/**
 * 詳細パネル（tasks.md 段階6）の画面のテスト。
 *
 * サンプルPJT（docs/test-cases.md 1章）を使う。値の細かい計算は Vitest で確かめてあるので、
 * ここでは「画面の操作がストアと一覧・カードにつながっているか」を代表の例で確かめる。
 */

import type { Page } from '@playwright/test';
import { expect, openOnMockupDay, row, test } from './helpers';

const panel = (page: Page) => page.getByRole('complementary', { name: 'タスクの詳細' });
const normalCard = (page: Page) => page.getByTestId('完了予定（通常 8h）');

/**
 * タスクのカードを押して、詳細パネルを開く。
 * カードの真ん中には工数の入力欄などがあるので、左端の ID のあたりを押す
 */
async function openCard(page: Page, label: string) {
  await page.getByTestId(`card-${label}`).click({ position: { x: 16, y: 10 } });
}

test('カードを押すとパネルが開き、パネルで変えた工数が一覧とカードに出る', async ({ page }) => {
  await openOnMockupDay(page);

  // ガントのマスや、カードの入力欄を押しても開かない（決定事項62）
  await row(page, '1-2').locator('[data-bar]').first().click();
  await page.getByLabel('要件定義書作成の工数（人日）').click();
  await expect(panel(page)).toBeHidden();

  // カードを押すと開き、そのタスクが出る。開いたカードは「開いている」状態になる
  await openCard(page, '1-2');
  await expect(panel(page)).toBeVisible();
  await expect(panel(page).getByLabel('タスク名')).toHaveValue('要件定義書作成');
  await expect(panel(page)).toContainText('進行中');
  await expect(page.getByRole('button', { name: '要件定義書作成の詳細を開く' })).toHaveAttribute(
    'aria-expanded',
    'true',
  );

  // パネルで工数を 3.0 → 1.0 にすると、一覧の欄と、後ろの日程・カードが変わる
  await panel(page).getByLabel('工数（人日）').fill('1.0');
  await expect(page.getByLabel('要件定義書作成の工数（人日）')).toHaveValue('1.0');
  await expect(row(page, '1-2')).toContainText('11/18');
  await expect(normalCard(page)).toContainText('12/30(水)');
  // 残工数（自動）と進捗も変わる：工数 1.0・進捗 60% → 残り 0.4、終わった分 0.6
  await expect(panel(page)).toContainText('0.6 / 1.0 人日');

  // タスク名を変えると、一覧の名前も変わる
  await panel(page).getByLabel('タスク名').fill('要件定義書v2');
  await expect(row(page, '1-2')).toContainText('要件定義書v2');

  // 優先度を low にすると、一覧の記号が「-」になる
  await panel(page).getByRole('button', { name: '低' }).click();
  await expect(row(page, '1-2').getByText('-', { exact: true })).toBeVisible();
});

test('前後のタスクへ移れ、Esc で閉じる', async ({ page }) => {
  await openOnMockupDay(page);
  await openCard(page, '1-2');

  // 次は、工程の帯を飛ばして 2-1 基本設計（決定事項64）
  await panel(page).getByRole('button', { name: '次のタスク' }).click();
  await expect(panel(page).getByLabel('タスク名')).toHaveValue('基本設計');
  // 親は工数・進捗率を自動の値で出し、優先度は出さない（決定事項67）
  await expect(panel(page)).toContainText('工数（自動）');
  await expect(panel(page).getByRole('group', { name: '優先度' })).toBeHidden();

  // 前へ2回で先頭（1-1）。先頭では「前のタスク」を押せない
  await panel(page).getByRole('button', { name: '前のタスク' }).click();
  await panel(page).getByRole('button', { name: '前のタスク' }).click();
  await expect(panel(page).getByLabel('タスク名')).toHaveValue('現状ヒアリング');
  await expect(panel(page).getByRole('button', { name: '前のタスク' })).toBeDisabled();

  // Esc で閉じる（決定事項63）
  await page.keyboard.press('Escape');
  await expect(panel(page)).toBeHidden();
});

test('削除は件数つきの確認を出し、Ctrl+Z で戻せる', async ({ page }) => {
  await openOnMockupDay(page);
  await openCard(page, '2-1'); // 基本設計（子が2件）

  // 確認を出して、キャンセルすると何も消えない
  await panel(page).getByRole('button', { name: '削除' }).click();
  const dialog = page.getByRole('dialog', { name: '「基本設計」を削除しますか？' });
  await expect(dialog).toContainText('子タスク2件も一緒に削除されます');
  await dialog.getByRole('button', { name: 'キャンセル' }).click();
  await expect(dialog).toBeHidden();
  await expect(panel(page)).toBeVisible();
  await expect(row(page, '2-1')).toContainText('基本設計');

  // もう一度押して削除すると、子ごと消え、パネルも閉じる
  await panel(page).getByRole('button', { name: '削除' }).click();
  await dialog.getByRole('button', { name: '削除' }).click();
  await expect(panel(page)).toBeHidden();
  await expect(row(page, '2-1')).toContainText('詳細設計');
  await expect(row(page, '2-1-1')).toHaveCount(0);

  // Ctrl+Z で戻る
  await page.keyboard.press('Control+z');
  await expect(row(page, '2-1')).toContainText('基本設計');
  await expect(row(page, '2-1-2')).toContainText('DB設計');
});

test('付け替えと、子タスクの追加ができる', async ({ page }) => {
  await openOnMockupDay(page);
  await openCard(page, '2-2'); // 詳細設計（末端）

  // 親タスクに 2-1 基本設計を選ぶと、その子の末尾（2-1-3）に移る
  await panel(page).getByLabel('親タスク').selectOption({ label: '2-1 基本設計' });
  await expect(row(page, '2-1-3')).toContainText('詳細設計');
  await expect(panel(page)).toContainText('2-1-3');

  // ＋子タスクを追加：足した子（孫）をそのまま開く（決定事項69）
  await panel(page).getByRole('button', { name: '＋ 子タスクを追加' }).click();
  await expect(panel(page).getByLabel('タスク名')).toHaveValue('新しいタスク');
  await expect(panel(page)).toContainText('2-1-3-1');
  // 孫のパネルでは「＋子タスクを追加」を出さない（決定事項12）
  await expect(panel(page).getByRole('button', { name: '＋ 子タスクを追加' })).toBeHidden();
});

test('開いたタスクのバーが、パネルに隠れない範囲に来るようスクロールする', async ({ page }) => {
  await openOnMockupDay(page);
  // 5-1 本番リリースのバーは、ガントの終わり近く（12/31〜1/4）にある
  await openCard(page, '5-1');

  const panelLeft = (await panel(page).boundingBox())!.x;
  // 左に固定したタスク表（行の左側の部品）の右端
  const table = (await row(page, '5-1').locator(':scope > div').first().boundingBox())!;
  const tableRight = table.x + table.width;
  const bars = row(page, '5-1').locator('[data-bar]');

  // なめらかにスクロールするので、止まるまで繰り返し確かめる
  await expect
    .poll(async () => {
      const first = (await bars.first().boundingBox())!;
      const last = (await bars.last().boundingBox())!;
      // バーの左端がタスク表より右に、右端がパネルより左にあれば、見えている
      return first.x >= tableRight && last.x + last.width <= panelLeft;
    })
    .toBe(true);
});
