/**
 * 休業日・有給のダイアログ（tasks.md 8-2、決定事項17・81）の画面のテスト。
 *
 * サンプルPJT（docs/test-cases.md 1章）の完了予定（通常 8h）は 1/4(月)。
 * 12/29〜1/3 を「年末休業」で足すと、平日の 12/29・12/30・12/31 の3日だけが入る
 * （1/1 は元日、1/2・1/3 は土日なので足さない）。
 * その3日が稼働日でなくなるので、完了予定は3営業日遅れて 1/7(木) になる。
 */

import type { Page } from '@playwright/test';
import { expect, openOnMockupDay, test } from './helpers';

const normalCard = (page: Page) => page.getByTestId('完了予定（通常 8h）');
const dialogOf = (page: Page) => page.getByRole('dialog', { name: '休業日・有給' });

test('期間で足すと平日だけが入り、日程が組み直される。1日ずつ消せて、Ctrl+Z で戻る', async ({
  page,
}) => {
  await openOnMockupDay(page);
  await expect(normalCard(page)).toContainText('1/4(月)');

  await page.getByRole('button', { name: '休業日・有給' }).click();
  const dialog = dialogOf(page);
  await expect(dialog).toContainText('まだありません。');

  await dialog.getByLabel('開始日').fill('2026-12-29');
  await dialog.getByLabel('終了日（期間で足すとき）').fill('2027-01-03');
  await dialog.getByLabel('名前').fill('年末休業');
  await dialog.getByRole('button', { name: '追加' }).click();

  // 足した日数と、飛ばした土日・祝日の日数を出す。欄は空に戻る
  await expect(dialog.getByRole('status')).toHaveText(
    '3日を足しました。土日・祝日の3日は、もともと休みのため足していません。',
  );
  await expect(dialog.getByLabel('開始日')).toHaveValue('');
  // 一覧は年の見出しの下に、日付の順で並ぶ
  const list = dialog.getByRole('region', { name: '2026年' });
  await expect(list.getByRole('listitem')).toHaveText([
    /12\/29\(火\)\s*年末休業/,
    /12\/30\(水\)\s*年末休業/,
    /12\/31\(木\)\s*年末休業/,
  ]);
  // ダイアログの後ろで、日程が組み直されている
  await expect(normalCard(page)).toContainText('1/7(木)');

  // 1日消すと、その分だけ早まる
  await dialog.getByRole('button', { name: '2026年12/30(水)を削除' }).click();
  await expect(list.getByRole('listitem')).toHaveCount(2);
  await expect(normalCard(page)).toContainText('1/6(水)');

  // Ctrl+Z で、消した日が戻る
  await page.keyboard.press('Control+z');
  await expect(list.getByRole('listitem')).toHaveCount(3);

  // Esc で閉じる
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(normalCard(page)).toContainText('1/7(木)');
});

test('土日・祝日だけを指定したときは足さず、理由を出す', async ({ page }) => {
  await openOnMockupDay(page);
  await page.getByRole('button', { name: '休業日・有給' }).click();
  const dialog = dialogOf(page);

  // 12/5 は土曜
  await dialog.getByLabel('開始日').fill('2026-12-05');
  await dialog.getByRole('button', { name: '追加' }).click();
  await expect(dialog.getByRole('status')).toHaveText(
    '12/5(土) は土日・祝日のため、もともと休みです。足す必要はありません。',
  );
  await expect(dialog).toContainText('まだありません。');
  await expect(normalCard(page)).toContainText('1/4(月)');
});
