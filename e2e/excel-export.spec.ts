/**
 * Excel出力のボタン（tasks.md 段階9B）の画面のテスト。
 *
 * 「Excel出力」を押すと、`工数ガント_<PJT名>_<出力日>.xlsx` がダウンロードされることを確かめる。
 * 画面はビルドした dist/index.html を file:// で開くので（e2e/helpers.ts）、
 * file:// でもダウンロードできることも、ここで確かめられる（architecture.md 9章「file:// でも動く」）。
 *
 * 時計を画面案と同じ「2026-11-19(木) 東京」に合わせるので、出力日は 2026-11-19 になる。
 * ダウンロードしたファイルは ExcelJS で読み戻し、Excel のファイルとして開けることも確かめる。
 * ファイルの中身の細かい確かめは Vitest（tests/excel.test.ts・tests/excel-file.test.ts）で行っている。
 */

import ExcelJS from 'exceljs';
import { expect, openOnMockupDay, test } from './helpers';

/** サンプルPJT（社内ポータル刷新）を、2026-11-19 の東京で開いたときのファイル名 */
const EXPECTED_FILE_NAME = '工数ガント_社内ポータル刷新_2026-11-19.xlsx';

test('Excel出力のボタンを押すと、xlsx がダウンロードされる', async ({ page }) => {
  await openOnMockupDay(page);

  // 失敗したときの alert が出たら、テストを失敗させる（alert はテストを止めてしまうので、閉じてから記録する）
  const dialogs: string[] = [];
  page.on('dialog', (dialog) => {
    dialogs.push(dialog.message());
    void dialog.dismiss();
  });

  // waitForEvent('download') は、ダウンロードが始まるのを待つ。
  // 押す前に待ち始めておかないと、押した直後に始まったダウンロードを取りこぼすことがあるので、
  // 「待ち始める → 押す → 待ち終わる」の順に書く
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Excel出力' }).click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toBe(EXPECTED_FILE_NAME);

  // ダウンロードしたファイルを読み戻す。xlsx として開け、通常と残業の2枚のシートがある
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(await download.path());
  expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
    'ガント（通常8h）',
    'ガント（残業10h）',
  ]);

  expect(dialogs).toEqual([]);
});
