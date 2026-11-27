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

  // 失敗の知らせ（段階8：左下の知らせ）は出ていない
  await expect(page.getByTestId('notice')).toHaveCount(0);
});

test('Excel のファイルを作れなかったときは、左下に知らせを出す（SPEC 3.3、tasks.md 8-4）', async ({
  page,
}) => {
  // ダウンロードの URL を作る関数を、失敗するものに差し替えてから開く（失敗したときの動きを確かめるため）
  await page.addInitScript(() => {
    URL.createObjectURL = () => {
      throw new Error('テストのために失敗させる');
    };
  });
  await openOnMockupDay(page);
  await page.getByRole('button', { name: 'Excel出力' }).click();

  const notice = page.getByTestId('notice');
  await expect(notice).toContainText('Excel のファイルを作れませんでした。');
  await expect(notice).toHaveAttribute('data-kind', 'export-error');
});
