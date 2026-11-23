/**
 * Excel のブック（src/excel/workbook.ts）のテスト（tasks.md 段階9A の完了条件）。
 *
 * 画面案のデータ（test-cases.md 1章）でブックを作り、いったん xlsx のファイル（バイト列）に書き出してから
 * 読み戻して、セルの値・塗り・罫線・文字の色・ウィンドウ枠の固定を確かめる。
 * 読み戻すのは、「ExcelJS のメモリの上では正しいが、ファイルにすると消える」設定を見逃さないため。
 *
 * 日程そのものの正しさは tests/schedule.test.ts で確かめているので、ここでは
 * 「計算結果が、決まった場所に、決まった見た目で書かれているか」を見る。
 */

import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { daysBetween } from '../src/core/calendar';
import { barCells, schedule } from '../src/core/schedule';
import type { DateString, DayOff, Project } from '../src/core/types';
import { argb, type ExcelColorToken } from '../src/excel/colors';
import { buildWorkbook, pxToColumnWidth } from '../src/excel/workbook';
import { mockupProject, project, task } from './helpers';

/** 画面案のデータの「今日」（test-cases.md 1章） */
const TODAY = '2026-11-19';

/** 通常 8h と残業 10h のシートの名前 */
const NORMAL = 'ガント（通常8h）';
const OVERTIME = 'ガント（残業10h）';

/** タスク表の列の数（A〜J）。日付の列は K 列（11）から */
const FIRST_DAY_COLUMN = 11;

/** xlsx のファイル（バイト列）を読み戻す */
async function reload(buffer: ExcelJS.Buffer): Promise<ExcelJS.Workbook> {
  const reloaded = new ExcelJS.Workbook();
  await reloaded.xlsx.load(buffer);
  return reloaded;
}

/** ブックを作り、xlsx に書き出して読み戻す */
async function buildAndReload(
  pjt: Project,
  daysOff: DayOff[] = [],
  today: DateString = TODAY,
): Promise<ExcelJS.Workbook> {
  return reload(await buildWorkbook(pjt, daysOff, today).xlsx.writeBuffer());
}

/**
 * 画面案のデータ（mockupProject）のブックを、書き出して読み戻す。
 *
 * 多くのテストが同じ画面案のデータを使うので、書き出したファイル（バイト列）を1回だけ作って使い回す。
 * ブックを作って書き出すのは、読み戻すより時間がかかるため（1回およそ 10ms）。
 *
 * 読み戻すのはテストごとに行い、それぞれ別の Workbook を返す。
 * ExcelJS は、getCell で空のセルを読んだだけでもセルを作るので、
 * 読み戻したブックまで使い回すと、前のテストが読んだセルで列の数（columnCount）などが変わりうる。
 * テストどうしが影響し合わないよう、ブックは使い回さない。
 */
let mockupBuffer: Promise<ExcelJS.Buffer> | null = null;
async function mockupWorkbook(): Promise<ExcelJS.Workbook> {
  // 最初に呼ばれたときだけ書き出す。Promise を覚えておくので、同時に呼ばれても書き出しは1回
  mockupBuffer ??= buildWorkbook(mockupProject(), [], TODAY).xlsx.writeBuffer();
  return reload(await mockupBuffer);
}

/** シートを名前で取り出す。なければテストを失敗させる */
function sheetOf(workbook: ExcelJS.Workbook, name: string): ExcelJS.Worksheet {
  const sheet = workbook.getWorksheet(name);
  if (sheet === undefined) {
    throw new Error(`シート ${name} がありません`);
  }
  return sheet;
}

/** その日付が何列目か。日付の列は開始日から1日1列なので、開始日からの日数で決まる */
function columnOf(pjt: Project, date: DateString): number {
  return FIRST_DAY_COLUMN + daysBetween(pjt.start, date);
}

/** A 列の ID（'1-2-1'）から、その行の番号を探す */
function rowNumberOf(sheet: ExcelJS.Worksheet, label: string): number {
  for (let rowNumber = 6; rowNumber <= sheet.rowCount; rowNumber += 1) {
    if (sheet.getCell(rowNumber, 1).value === label) {
      return rowNumber;
    }
  }
  throw new Error(`ID ${label} の行がありません`);
}

/** セルの塗りの色（ARGB）。塗っていなければ null */
function fillOf(cell: ExcelJS.Cell): string | null {
  const fill = cell.fill as ExcelJS.FillPattern | undefined;
  if (fill === undefined || fill.type !== 'pattern' || fill.pattern !== 'solid') {
    return null;
  }
  return fill.fgColor?.argb ?? null;
}

/** 文字の色（ARGB） */
function fontColorOf(cell: ExcelJS.Cell): string | undefined {
  return cell.font?.color?.argb;
}

describe('ブックの形', () => {
  it('シートは「ガント（通常8h）」「ガント（残業10h）」の2枚で、この順に並ぶ', async () => {
    const workbook = await mockupWorkbook();
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([NORMAL, OVERTIME]);
  });

  it('6行目・K列でウィンドウ枠を固定する', async () => {
    const workbook = await mockupWorkbook();
    for (const name of [NORMAL, OVERTIME]) {
      const view = sheetOf(workbook, name).views[0];
      expect(view).toMatchObject({ state: 'frozen', xSplit: 10, ySplit: 5, topLeftCell: 'K6' });
    }
  });

  it('列の幅は画面案②の px を換算した値（ID 48px、名前 182px、日付 14px）', async () => {
    const sheet = sheetOf(await mockupWorkbook(), NORMAL);
    expect(sheet.getColumn(1).width).toBe(pxToColumnWidth(48));
    expect(sheet.getColumn(2).width).toBe(pxToColumnWidth(182));
    expect(sheet.getColumn(10).width).toBe(pxToColumnWidth(64));
    expect(sheet.getColumn(FIRST_DAY_COLUMN).width).toBe(pxToColumnWidth(14));
  });

  it('px から列の幅への換算：（px − 5）÷ 7 を小数2桁に丸める', () => {
    expect(pxToColumnWidth(48)).toBe(6.14);
    expect(pxToColumnWidth(14)).toBe(1.29);
    expect(pxToColumnWidth(182)).toBe(25.29);
  });

  it('書体は游ゴシック', async () => {
    const sheet = sheetOf(await mockupWorkbook(), NORMAL);
    expect(sheet.getCell('A1').font?.name).toBe('游ゴシック');
    expect(sheet.getCell('B6').font?.name).toBe('游ゴシック');
  });
});

describe('1〜2行目：タイトルと条件', () => {
  it('通常のシート：タイトルと、開始日・エンド日・完了予定・総工数・稼働時間', async () => {
    const sheet = sheetOf(await mockupWorkbook(), NORMAL);
    expect(sheet.getCell('A1').value).toBe('テスト用PJT　工数ガント（通常 8h）');
    expect(sheet.getCell('A1').font?.bold).toBe(true);
    // 完了予定（通常）は 1/4、総工数は 33.5 人日（TC-01・TC-04）
    expect(sheet.getCell('A2').value).toBe(
      [
        '開始日 2026-11-16',
        'エンド日 2026-12-25',
        '完了予定 2027-01-04',
        '総工数 33.5 人日',
        '1人日=8h／1日の稼働=8h',
      ].join('　'),
    );
  });

  it('残業のシート：完了予定と稼働時間が残業 10h の値になる', async () => {
    const sheet = sheetOf(await mockupWorkbook(), OVERTIME);
    expect(sheet.getCell('A1').value).toBe('テスト用PJT　工数ガント（残業 10h）');
    // 完了予定（残業）は 12/23（TC-01）
    expect(sheet.getCell('A2').value).toBe(
      [
        '開始日 2026-11-16',
        'エンド日 2026-12-25',
        '完了予定 2026-12-23',
        '総工数 33.5 人日',
        '1人日=8h／1日の稼働=10h',
      ].join('　'),
    );
  });

  it('エンド日が空欄で、タスクもないときは、エンド日と完了予定を「—」にする', async () => {
    const empty = project({ end: null, tasksByPhase: [] });
    const sheet = sheetOf(await buildAndReload(empty), NORMAL);
    expect(sheet.getCell('A2').value).toBe(
      [
        '開始日 2026-11-16',
        'エンド日 —',
        '完了予定 —',
        '総工数 0.0 人日',
        '1人日=8h／1日の稼働=8h',
      ].join('　'),
    );
  });
});

describe('3〜5行目：見出し', () => {
  it('3行目：最初の日と、毎月1日の列に月を書く', async () => {
    const pjt = mockupProject();
    const sheet = sheetOf(await mockupWorkbook(), NORMAL);
    expect(sheet.getCell(3, columnOf(pjt, '2026-11-16')).value).toBe('11月');
    expect(sheet.getCell(3, columnOf(pjt, '2026-11-17')).value).toBeNull();
    expect(sheet.getCell(3, columnOf(pjt, '2026-12-01')).value).toBe('12月');
    expect(sheet.getCell(3, columnOf(pjt, '2027-01-01')).value).toBe('1月');
  });

  it('4行目：タスク表の列見出しと、日付。祝日は「休」', async () => {
    const pjt = mockupProject();
    const sheet = sheetOf(await mockupWorkbook(), NORMAL);
    const headers = Array.from({ length: 10 }, (_, i) => sheet.getCell(4, i + 1).value);
    expect(headers).toEqual([
      'ID',
      '工程 / タスク',
      '優先',
      '工数',
      '進捗',
      '残工数',
      '開始',
      '終了',
      '期日',
      '状態',
    ]);
    expect(fillOf(sheet.getCell('A4'))).toBe(argb('excel-header'));
    expect(sheet.getCell('A4').font?.bold).toBe(true);

    expect(sheet.getCell(4, columnOf(pjt, '2026-11-16')).value).toBe(16);
    // 11/23 は勤労感謝の日
    expect(sheet.getCell(4, columnOf(pjt, '2026-11-23')).value).toBe('休');
  });

  it('5行目：曜日。日曜・祝日は sunday、土曜は saturday の色', async () => {
    const pjt = mockupProject();
    const sheet = sheetOf(await mockupWorkbook(), NORMAL);
    const monday = sheet.getCell(5, columnOf(pjt, '2026-11-16'));
    const saturday = sheet.getCell(5, columnOf(pjt, '2026-11-21'));
    const sunday = sheet.getCell(5, columnOf(pjt, '2026-11-22'));
    const holiday = sheet.getCell(5, columnOf(pjt, '2026-11-23'));

    expect([monday.value, saturday.value, sunday.value, holiday.value]).toEqual([
      '月',
      '土',
      '日',
      '月',
    ]);
    expect(fontColorOf(monday)).toBe(argb('on-surface-sub'));
    expect(fontColorOf(saturday)).toBe(argb('saturday'));
    expect(fontColorOf(sunday)).toBe(argb('sunday'));
    expect(fontColorOf(holiday)).toBe(argb('sunday'));
  });

  it('休業日・有給も「休」にし、グレーにする', async () => {
    const pjt = mockupProject();
    const daysOff: DayOff[] = [{ date: '2026-11-18', label: '有給' }];
    const sheet = sheetOf(await buildAndReload(pjt, daysOff), NORMAL);
    const cell = sheet.getCell(4, columnOf(pjt, '2026-11-18'));
    expect(cell.value).toBe('休');
    expect(fillOf(cell)).toBe(argb('excel-day-off'));
  });
});

describe('6行目から：タスクの行', () => {
  it('末端のタスク：ID、字下げした名前、優先度、工数・進捗・残工数、日程、状態', async () => {
    const sheet = sheetOf(await mockupWorkbook(), NORMAL);
    // 1-2 要件定義書作成：工数 3.0・進捗 60%・残工数 1.2、11/18 → 11/20（TC-01）
    const r = rowNumberOf(sheet, '1-2');
    const values = Array.from({ length: 10 }, (_, i) => sheet.getCell(r, i + 1).value);
    expect(values).toEqual([
      '1-2',
      '　要件定義書作成',
      '=',
      3,
      0.6,
      1.2,
      '2026-11-18',
      '2026-11-20',
      null,
      '進行中',
    ]);
    // 工数・進捗・残工数は数値で入れ、表示の形は書式で付ける
    expect(sheet.getCell(r, 4).numFmt).toBe('0.0');
    expect(sheet.getCell(r, 5).numFmt).toBe('0%');
    // 末端の行は太字にせず、背景も付けない。
    // 太字でないことは、ファイルに書くと「太字の指定がない」になり、読み戻すと undefined になる
    expect(sheet.getCell(r, 2).font?.bold).toBeFalsy();
    expect(fillOf(sheet.getCell(r, 2))).toBeNull();
  });

  it('孫の階層は、全角スペース2つで字下げする', async () => {
    const sheet = sheetOf(await mockupWorkbook(), NORMAL);
    expect(sheet.getCell(rowNumberOf(sheet, '2-1-1'), 2).value).toBe('　　画面設計');
  });

  it('工程の行：字下げなし、太字、phase-row の背景。優先度は出さない', async () => {
    const sheet = sheetOf(await mockupWorkbook(), NORMAL);
    const r = rowNumberOf(sheet, '2');
    expect(sheet.getCell(r, 2).value).toBe('設計');
    expect(sheet.getCell(r, 3).value).toBeNull();
    // 設計の工数は 3.0 + 2.0 + 4.0 = 9.0
    expect(sheet.getCell(r, 4).value).toBe(9);
    for (let column = 1; column <= 10; column += 1) {
      expect(sheet.getCell(r, column).font?.bold).toBe(true);
      expect(fillOf(sheet.getCell(r, column))).toBe(argb('phase-row'));
    }
  });

  it('親タスクの行：太字、excel-parent-row の背景。優先度は出さない', async () => {
    const sheet = sheetOf(await mockupWorkbook(), NORMAL);
    const r = rowNumberOf(sheet, '2-1');
    expect(sheet.getCell(r, 2).value).toBe('　基本設計');
    expect(sheet.getCell(r, 3).value).toBeNull();
    expect(sheet.getCell(r, 2).font?.bold).toBe(true);
    expect(fillOf(sheet.getCell(r, 2))).toBe(argb('excel-parent-row'));
  });

  it('親の進捗率は、画面と同じく整数%に丸める（1%〜99% の範囲）', async () => {
    // 子 3件（100%・0%・0%）の平均は 33.33…% → 33%
    const pjt = project({
      tasksByPhase: [
        [
          task('親', {
            children: [
              task('子1', { effort: 1, progress: 100 }),
              task('子2', { effort: 1 }),
              task('子3', { effort: 1 }),
            ],
          }),
        ],
      ],
    });
    const sheet = sheetOf(await buildAndReload(pjt), NORMAL);
    expect(sheet.getCell(rowNumberOf(sheet, '1-1'), 5).value).toBe(0.33);
  });

  it('タスクのない工程：工数 0.0 で、日程とバーは空', async () => {
    const pjt = project({ tasksByPhase: [[task('ひとつだけ', { effort: 1 })]] });
    const sheet = sheetOf(await buildAndReload(pjt), NORMAL);
    const r = rowNumberOf(sheet, '2');
    expect(sheet.getCell(r, 2).value).toBe('設計');
    expect(sheet.getCell(r, 4).value).toBe(0);
    expect(sheet.getCell(r, 7).value).toBeNull();
    expect(sheet.getCell(r, 8).value).toBeNull();
    // 稼働日の列（11/16）も塗らない
    expect(fillOf(sheet.getCell(r, columnOf(pjt, '2026-11-16')))).toBeNull();
  });
});

describe('超過と期日超過', () => {
  it('エンド日を超えた末端の行：名前・終了日・状態を赤字にし、期日超過も状態に書く', async () => {
    const sheet = sheetOf(await mockupWorkbook(), NORMAL);
    // 5-1 本番リリース：通常では 1/4 に終わり、エンド日 12/25 と期日 12/25 の両方を超える（TC-01）
    const r = rowNumberOf(sheet, '5-1');
    expect(sheet.getCell(r, 8).value).toBe('2027-01-04');
    expect(sheet.getCell(r, 10).value).toBe('超過・期日超過');
    expect(fontColorOf(sheet.getCell(r, 2))).toBe(argb('error'));
    expect(fontColorOf(sheet.getCell(r, 8))).toBe(argb('error'));
    expect(fontColorOf(sheet.getCell(r, 10))).toBe(argb('error'));
    // 開始日など、ほかの欄は黒のまま
    expect(fontColorOf(sheet.getCell(r, 7))).toBe(argb('on-surface'));
  });

  it('工程・親が超過しても、文字は赤くしない（バーだけ赤）', async () => {
    const pjt = mockupProject();
    const sheet = sheetOf(await mockupWorkbook(), NORMAL);
    // 5 リリース：通常では 1/4 に終わるので超過
    const r = rowNumberOf(sheet, '5');
    expect(sheet.getCell(r, 10).value).toBe('超過');
    expect(fontColorOf(sheet.getCell(r, 2))).toBe(argb('on-surface'));
    expect(fontColorOf(sheet.getCell(r, 8))).toBe(argb('on-surface'));
    // 1/4 のマスは赤いバー（残り）
    expect(fillOf(sheet.getCell(r, columnOf(pjt, '2027-01-04')))).toBe(argb('error-soft'));
  });

  it('残業のシートでは、同じタスクがエンド日に間に合うので赤くならない', async () => {
    const pjt = mockupProject();
    const sheet = sheetOf(await mockupWorkbook(), OVERTIME);
    // 5-1 本番リリース：残業では 12/23 に終わる（TC-01）
    const r = rowNumberOf(sheet, '5-1');
    expect(sheet.getCell(r, 8).value).toBe('2026-12-23');
    expect(sheet.getCell(r, 10).value).toBe('未着手');
    expect(fontColorOf(sheet.getCell(r, 2))).toBe(argb('on-surface'));
    expect(fillOf(sheet.getCell(r, columnOf(pjt, '2026-12-23')))).toBe(argb('primary-soft'));
  });
});

describe('ガントのセル', () => {
  it('バーは1日1セル。完了分と残りを、その日の真ん中が境目より前かで塗り分ける', async () => {
    const pjt = mockupProject();
    const sheet = sheetOf(await mockupWorkbook(), NORMAL);
    // 1-2 要件定義書作成：位置 2 – 5、進捗 60% なので境目は 3.8（test-cases.md 0.2）
    // 11/18（真ん中 2.5）・11/19（3.5）は完了分、11/20（4.5）は残り
    const r = rowNumberOf(sheet, '1-2');
    expect(fillOf(sheet.getCell(r, columnOf(pjt, '2026-11-18')))).toBe(argb('primary'));
    expect(fillOf(sheet.getCell(r, columnOf(pjt, '2026-11-19')))).toBe(argb('primary'));
    expect(fillOf(sheet.getCell(r, columnOf(pjt, '2026-11-20')))).toBe(argb('primary-soft'));
    // バーの前後は塗らない
    expect(fillOf(sheet.getCell(r, columnOf(pjt, '2026-11-17')))).toBeNull();
    expect(fillOf(sheet.getCell(r, columnOf(pjt, '2026-11-24')))).toBeNull();
  });

  it('親のバーは parent-done・parent-rest、工程のバーは parent-done・phase-rest', async () => {
    const pjt = mockupProject();
    const sheet = sheetOf(await mockupWorkbook(), NORMAL);
    // 2-1 基本設計と 2 設計は、どれも進捗 0% なので残りの色だけ
    const parent = rowNumberOf(sheet, '2-1');
    const phase = rowNumberOf(sheet, '2');
    expect(fillOf(sheet.getCell(parent, columnOf(pjt, '2026-11-24')))).toBe(argb('parent-rest'));
    expect(fillOf(sheet.getCell(phase, columnOf(pjt, '2026-11-24')))).toBe(argb('phase-rest'));
    // 1 要件定義：1-1（100%）・1-2（60%）の平均 80%。11/16 は完了分
    const req = rowNumberOf(sheet, '1');
    expect(fillOf(sheet.getCell(req, columnOf(pjt, '2026-11-16')))).toBe(argb('parent-done'));
  });

  it('どの行も、塗ったセルの数が barCells のマスの数と同じ（通常・残業とも）', async () => {
    const pjt = mockupProject();
    const workbook = await mockupWorkbook();
    const barColors = new Set(
      (
        [
          'primary',
          'primary-soft',
          'parent-done',
          'parent-rest',
          'phase-rest',
          'error',
          'error-soft',
        ] as ExcelColorToken[]
      ).map(argb),
    );

    for (const [name, hours] of [
      [NORMAL, 8],
      [OVERTIME, 10],
    ] as const) {
      const sheet = sheetOf(workbook, name);
      const rows = schedule(pjt, [], hours);
      rows.forEach((row, index) => {
        let painted = 0;
        for (let column = FIRST_DAY_COLUMN; column <= sheet.columnCount; column += 1) {
          const fill = fillOf(sheet.getCell(6 + index, column));
          if (fill !== null && barColors.has(fill)) {
            painted += 1;
          }
        }
        expect(painted, `${name} の ${row.label}`).toBe(barCells(row, hours).length);
      });
    }
  });

  it('土日祝の列は、バーのない行でもグレーにする', async () => {
    const pjt = mockupProject();
    const sheet = sheetOf(await mockupWorkbook(), NORMAL);
    const r = rowNumberOf(sheet, '1-1');
    expect(fillOf(sheet.getCell(r, columnOf(pjt, '2026-11-21')))).toBe(argb('excel-day-off'));
    expect(fillOf(sheet.getCell(r, columnOf(pjt, '2026-11-23')))).toBe(argb('excel-day-off'));
  });

  it('エンド日の列の右に赤い線を引く（ほかの列は細い罫線）', async () => {
    const pjt = mockupProject();
    const sheet = sheetOf(await mockupWorkbook(), NORMAL);
    for (const r of [4, 5, rowNumberOf(sheet, '1-1')]) {
      const endCell = sheet.getCell(r, columnOf(pjt, '2026-12-25'));
      expect(endCell.border?.right).toMatchObject({
        style: 'medium',
        color: { argb: argb('end-line') },
      });
      const nextCell = sheet.getCell(r, columnOf(pjt, '2026-12-26'));
      expect(nextCell.border?.right).toMatchObject({
        style: 'thin',
        color: { argb: argb('excel-grid') },
      });
    }
  });

  it('エンド日が空欄なら、赤い線は引かない', async () => {
    const pjt = { ...mockupProject(), end: null };
    const sheet = sheetOf(await buildAndReload(pjt), NORMAL);
    for (let column = FIRST_DAY_COLUMN; column <= sheet.columnCount; column += 1) {
      expect(sheet.getCell(4, column).border?.right?.style).toBe('thin');
    }
  });

  it('日付の列は、開始日から「エンド日と完了予定（通常）の遅い方」の1週間後まで（2枚とも同じ）', async () => {
    const pjt = mockupProject();
    const workbook = await mockupWorkbook();
    // 通常の完了予定 1/4 の1週間後 = 1/11 まで（TC-06）
    const lastColumn = columnOf(pjt, '2027-01-11');
    for (const name of [NORMAL, OVERTIME]) {
      const sheet = sheetOf(workbook, name);
      expect(sheet.columnCount).toBe(lastColumn);
      // 1/11 は成人の日なので「休」
      expect(sheet.getCell(4, lastColumn).value).toBe('休');
    }
  });
});
