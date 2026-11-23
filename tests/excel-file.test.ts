/**
 * Excel出力のファイル名（src/excel/fileName.ts）と、ファイルの中身（src/excel/exportFile.ts）のテスト
 * （tasks.md 9-5、SPEC 3.3）。
 *
 * ダウンロードそのもの（ボタンを押すとファイルが保存される）は、画面のテスト（e2e/dist-file.spec.ts）で確かめる。
 */

import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { createExcelFile, XLSX_MIME_TYPE } from '../src/excel/exportFile';
import { excelFileName, fileSafeProjectName } from '../src/excel/fileName';
import { mockupProject } from './helpers';

describe('excelFileName：工数ガント_<PJT名>_<出力日>.xlsx', () => {
  it('PJT名と出力日（YYYY-MM-DD）を入れる', () => {
    expect(excelFileName('社内ポータル刷新', '2026-11-23')).toBe(
      '工数ガント_社内ポータル刷新_2026-11-23.xlsx',
    );
  });

  it('ファイル名で使えない文字（/ \\ : * ? " < > |）は _ に置き換える', () => {
    expect(fileSafeProjectName('A/B案')).toBe('A_B案');
    expect(fileSafeProjectName('a\\b:c*d?e"f<g>h|i')).toBe('a_b_c_d_e_f_g_h_i');
    expect(excelFileName('A/B案', '2026-11-23')).toBe('工数ガント_A_B案_2026-11-23.xlsx');
  });

  it('改行やタブなどの制御文字も _ に置き換える', () => {
    expect(fileSafeProjectName('1行目\n2行目\tタブ')).toBe('1行目_2行目_タブ');
  });

  it('前後の空白（全角スペースを含む）は取り除き、間の空白は残す', () => {
    expect(fileSafeProjectName('  社内 ポータル　')).toBe('社内 ポータル');
  });

  it('PJT名が空欄、または空白だけなら「無題」にする', () => {
    expect(excelFileName('', '2026-11-23')).toBe('工数ガント_無題_2026-11-23.xlsx');
    expect(excelFileName(' 　 ', '2026-11-23')).toBe('工数ガント_無題_2026-11-23.xlsx');
  });
});

describe('createExcelFile：ダウンロードするファイルを作る', () => {
  it('ファイル名と、xlsx の Blob を返す。Blob を読み戻すと2枚のシートがある', async () => {
    const pjt = { ...mockupProject(), name: '社内ポータル刷新' };
    const file = await createExcelFile(pjt, [], '2026-11-19');

    expect(file.fileName).toBe('工数ガント_社内ポータル刷新_2026-11-19.xlsx');
    expect(file.blob.type).toBe(XLSX_MIME_TYPE);

    // Blob の中身が、Excel で開ける xlsx になっているか（ExcelJS で読み戻す）。
    // セルの中身の細かい確かめは tests/excel.test.ts で行っているので、ここではシートとタイトルだけを見る
    const reloaded = new ExcelJS.Workbook();
    await reloaded.xlsx.load(await file.blob.arrayBuffer());
    expect(reloaded.worksheets.map((sheet) => sheet.name)).toEqual([
      'ガント（通常8h）',
      'ガント（残業10h）',
    ]);
    expect(reloaded.getWorksheet('ガント（通常8h）')?.getCell('A1').value).toBe(
      '社内ポータル刷新　工数ガント（通常 8h）',
    );
  });
});
