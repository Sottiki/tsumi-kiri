/**
 * Excel出力のボタン（tasks.md 段階9B）の画面のテスト。
 *
 * 「Excel出力」を押すと、`工数ガント_<PJT名>_<出力日>.xlsx` がダウンロードされることを、
 * 開発サーバーの画面と、ビルドした dist/index.html（file://）の両方で確かめる
 * （architecture.md 9章「file:// でも動く」）。
 *
 * 時計を画面案と同じ「2026-11-19(木) 東京」に止めるので、出力日は 2026-11-19 になる。
 * ダウンロードしたファイルは ExcelJS で読み戻し、Excel のファイルとして開けることも確かめる。
 * セルの中身の細かい確かめは Vitest（tests/excel.test.ts）で行っている。
 */

import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import ExcelJS from 'exceljs';

test.use({ timezoneId: 'Asia/Tokyo' });

const distHtml = fileURLToPath(new URL('../dist/index.html', import.meta.url));

/** サンプルPJT（社内ポータル刷新）を、2026-11-19 の東京で開いたときのファイル名 */
const EXPECTED_FILE_NAME = '工数ガント_社内ポータル刷新_2026-11-19.xlsx';

/**
 * 「Excel出力」を押して、ダウンロードされたファイルを確かめる。
 *
 * waitForEvent('download') は、ダウンロードが始まるのを待つ。
 * 押す前に待ち始めておかないと、押した直後に始まったダウンロードを取りこぼすことがあるので、
 * 「待ち始める → 押す → 待ち終わる」の順に書く。
 */
async function exportAndCheck(page: Page) {
  // 失敗したときの alert が出たら、テストを失敗させる（alert はテストを止めてしまうので、閉じてから記録する）
  const dialogs: string[] = [];
  page.on('dialog', (dialog) => {
    dialogs.push(dialog.message());
    void dialog.dismiss();
  });

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Excel出力' }).click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toBe(EXPECTED_FILE_NAME);

  // ダウンロードしたファイルを読み戻す。xlsx として開け、通常と残業の2枚のシートがある
  const savedPath = await download.path();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(savedPath);
  expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
    'ガント（通常8h）',
    'ガント（残業10h）',
  ]);
  expect(workbook.getWorksheet('ガント（通常8h）')?.getCell('A1').value).toBe(
    '社内ポータル刷新　工数ガント（通常 8h）',
  );

  expect(dialogs).toEqual([]);
}

test('開発サーバー：Excel出力のボタンを押すと、xlsx がダウンロードされる', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-19T10:00:00+09:00'));
  await page.goto('/');
  await exportAndCheck(page);
});

test('file://：Excel出力のボタンを押すと、xlsx がダウンロードされる', async ({ page }) => {
  expect(existsSync(distHtml), '先に npm run build を行う').toBe(true);
  await page.clock.setFixedTime(new Date('2026-11-19T10:00:00+09:00'));
  await page.goto(pathToFileURL(distHtml).href);
  await exportAndCheck(page);
});
