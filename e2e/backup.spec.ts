/**
 * バックアップの書き出しと読み込み（tasks.md 8-3、決定事項18・82・83）の画面のテスト。
 *
 * 完了条件「バックアップを書き出して読み込むと、全PJTと休業日が元どおりになる」を確かめる。
 * 1. 休業日（12/10 有給）を足してから書き出す
 * 2. PJTを足し、休業日を消して、データを変える
 * 3. 書き出したファイルを読み込むと、確認の後に、書き出したときの状態に戻る。Ctrl+Z で読み込む前に戻る
 *
 * 12/10(木) を休みにすると、完了予定（通常 8h）は 1/4(月) から1営業日遅れて 1/5(火) になる。
 */

import type { Page } from '@playwright/test';
import { expect, openOnMockupDay, test } from './helpers';

const SAMPLE_NAME = '社内ポータル刷新';
const normalCard = (page: Page) => page.getByTestId('完了予定（通常 8h）');
const tabBar = (page: Page) => page.getByRole('navigation', { name: 'PJT' });

/** バックアップのメニューから、項目を選ぶ */
async function chooseBackup(page: Page, item: '書き出し' | '読み込み') {
  await page.getByRole('button', { name: 'バックアップ' }).click();
  await page.getByRole('button', { name: item }).click();
}

/** 休業日・有給のダイアログを開き、1日を足して閉じる */
async function addDayOff(page: Page, date: string, label: string) {
  await page.getByRole('button', { name: '休業日・有給' }).click();
  const dialog = page.getByRole('dialog', { name: '休業日・有給' });
  await dialog.getByLabel('開始日').fill(date);
  await dialog.getByLabel('名前').fill(label);
  await dialog.getByRole('button', { name: '追加' }).click();
  await dialog.getByRole('button', { name: '閉じる' }).click();
}

test('書き出したファイルを読み込むと、全PJTと休業日が元どおりになる。Ctrl+Z で読み込む前に戻る', async ({
  page,
}) => {
  await openOnMockupDay(page);
  await addDayOff(page, '2026-12-10', '有給');
  await expect(normalCard(page)).toContainText('1/5(火)');

  // --- 1. 書き出す。ファイル名は 工数ガント_バックアップ_<出力日>.json（決定事項82） ---
  const downloadPromise = page.waitForEvent('download');
  await chooseBackup(page, '書き出し');
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('工数ガント_バックアップ_2026-11-19.json');
  const backupPath = await download.path();

  // --- 2. データを変える：PJTを足し、休業日を消す ---
  await tabBar(page).getByRole('button', { name: 'PJTを追加' }).click();
  await expect(tabBar(page).getByRole('button', { name: '新しいPJT', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '休業日・有給' }).click();
  const dialog = page.getByRole('dialog', { name: '休業日・有給' });
  await dialog.getByRole('button', { name: '2026年12/10(木)を削除' }).click();
  await expect(dialog).toContainText('まだありません。');
  await dialog.getByRole('button', { name: '閉じる' }).click();

  // --- 3. 読み込む。ファイルを選ぶと、ファイルの中身の件数を添えた確認が出る（決定事項83） ---
  const chooserPromise = page.waitForEvent('filechooser');
  await chooseBackup(page, '読み込み');
  const chooser = await chooserPromise;
  await chooser.setFiles(backupPath);

  const confirm = page.getByRole('dialog', { name: 'バックアップを読み込みますか？' });
  await expect(confirm).toContainText(
    'ファイルの内容（PJT 1件、休業日・有給 1件）に置き換わります。',
  );
  await confirm.getByRole('button', { name: '上書き' }).click();

  // 書き出したときの状態に戻る：PJTはサンプルだけ、休業日は 12/10 だけ
  await expect(tabBar(page).getByRole('button', { name: '新しいPJT', exact: true })).toHaveCount(0);
  await expect(tabBar(page).getByRole('button', { name: SAMPLE_NAME, exact: true })).toBeVisible();
  await expect(normalCard(page)).toContainText('1/5(火)');
  // 読み込めたときの知らせは出さない
  await expect(page.getByTestId('notice')).toHaveCount(0);

  // Ctrl+Z で、読み込む前（PJTが2つ・休業日なし）に戻る
  await page.keyboard.press('Control+z');
  await expect(tabBar(page).getByRole('button', { name: '新しいPJT', exact: true })).toBeVisible();
});

test('壊れたファイルを読み込むと、理由を知らせ、データは変えない', async ({ page }) => {
  await openOnMockupDay(page);

  const chooserPromise = page.waitForEvent('filechooser');
  await chooseBackup(page, '読み込み');
  const chooser = await chooserPromise;
  await chooser.setFiles({
    name: 'broken.json',
    mimeType: 'application/json',
    buffer: Buffer.from('これは JSON ではない'),
  });

  // 左下に知らせが出る。確認のダイアログは出ない
  const notice = page.getByTestId('notice');
  await expect(notice).toHaveText(
    'バックアップを読み込めませんでした（JSON のファイルとして読めません）。データは変えていません。',
  );
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(normalCard(page)).toContainText('1/4(月)');

  // 閉じるボタンで消える
  await notice.getByRole('button', { name: '知らせを閉じる' }).click();
  await expect(notice).toHaveCount(0);
});
