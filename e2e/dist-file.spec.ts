/**
 * ビルドした dist/index.html（file://）の画面のテスト。
 *
 * - file:// で開けること（tasks.md 段階0 の完了条件。architecture.md 9章「file:// でも動く」）
 * - 「Excel出力」を押すと、`工数ガント_<PJT名>_<出力日>.xlsx` がダウンロードされること（tasks.md 段階9B）
 *
 * Excel出力は、開発サーバーでも file:// でも同じ処理なので、より条件の厳しい file:// だけで確かめる
 * （file:// では、ダウンロードの URL の扱いなどが開発サーバーと違う）。
 * 開発サーバーで開けることは、e2e/main-screen.spec.ts で確かめている。
 *
 * 時計を画面案と同じ「2026-11-19(木) 東京」に合わせるので、出力日は 2026-11-19 になる。
 * ダウンロードしたファイルは ExcelJS で読み戻し、Excel のファイルとして開けることも確かめる。
 * ファイルの中身の細かい確かめは Vitest（tests/excel.test.ts・tests/excel-file.test.ts）で行っている。
 */

import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ExcelJS from 'exceljs';
import { expect, expectAppOpens, openOnMockupDay, test } from './helpers';

const distHtml = fileURLToPath(new URL('../dist/index.html', import.meta.url));

/** サンプルPJT（社内ポータル刷新）を、2026-11-19 の東京で開いたときのファイル名 */
const EXPECTED_FILE_NAME = '工数ガント_社内ポータル刷新_2026-11-19.xlsx';

test('file://：ビルドした画面が開け、Excel出力で xlsx がダウンロードされる', async ({ page }) => {
  expect(existsSync(distHtml), '先に npm run build を行う').toBe(true);
  await openOnMockupDay(page, pathToFileURL(distHtml).href);
  await expectAppOpens(page);

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
