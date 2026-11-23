/**
 * Excel のブックを組み立てる（tasks.md 9-1〜9-4、SPEC 3.3、architecture.md 9章）
 *
 * 表示中のPJTと休業日から、画面案②のとおりの Excel ブックを作る。
 * このファイルはブックを返すところまで。.xlsx のファイルにするのは exportFile.ts、ダウンロードは ui/download.ts。
 *
 * ■ シートの形（通常・残業の2枚とも同じ形）
 *
 *        A    B              C    D    E    F      G     H     I     J     K  L  M …
 *   1   タイトル（例：社内ポータル刷新 工数ガント（通常 8h））
 *   2   条件（開始日・エンド日・完了予定・総工数・稼働時間）
 *   3                                                                  11月         ← 月
 *   4   ID   工程 / タスク  優先 工数 進捗 残工数 開始 終了 期日 状態  16 17 18 …   ← 列見出し＋日
 *   5                                                                  月 火 水 …   ← 曜日
 *   6   1    要件定義       …                                          ■ ■ □ …     ← ここからタスク
 *
 * - A〜J 列がタスク表、K 列から右が1日1列のガント
 * - 6行目・K列でウィンドウ枠を固定する（見出しとタスク表が、スクロールしても残る）
 *
 * ■ 計算は core に任せる
 * 日程・集計（schedule）、表示する日（listGanttDays）、バーのマス（barCells）、
 * 完了予定と総工数（summarizeCards）は、画面と同じ core の関数を使う。
 * ここでは計算をせず、結果をセルに並べて色を付けることだけをする。
 * こうしておけば、画面と Excel で日程やバーの塗り分けが食い違わない（SPEC 3.3「塗り方は画面と同じ」）。
 */

import ExcelJS from 'exceljs';
import { dayOfWeek } from '../core/calendar';
import {
  barCells,
  displayProgressPct,
  listGanttDays,
  schedule,
  summarizeCards,
} from '../core/schedule';
import { findTask } from '../core/tree';
import type {
  DateString,
  DayOff,
  GanttDay,
  HoursPerDay,
  Priority,
  Project,
  ScheduleRow,
} from '../core/types';
import { argb, type ExcelColorToken } from './colors';

// ---------------------------------------------------------------------------
// シートの寸法と文字（画面案②の値。DESIGN.md の Typography・architecture.md 9章）
// ---------------------------------------------------------------------------

/**
 * タスク表の列（A〜J）。幅は画面案②の px。
 * 並び順がそのまま列の順になる（1番目が A 列）。
 */
const TABLE_COLUMNS = [
  { header: 'ID', widthPx: 48 },
  { header: '工程 / タスク', widthPx: 182 },
  { header: '優先', widthPx: 40 },
  { header: '工数', widthPx: 52 },
  { header: '進捗', widthPx: 52 },
  { header: '残工数', widthPx: 56 },
  { header: '開始', widthPx: 84 },
  { header: '終了', widthPx: 84 },
  { header: '期日', widthPx: 84 },
  { header: '状態', widthPx: 64 },
] as const;

/**
 * タスク表の各列の番号（1 = A 列）。セルを書くときに、番号の代わりに名前で指すために使う。
 * TABLE_COLUMNS の並びと合わせておく。
 */
const COL = {
  id: 1,
  name: 2,
  priority: 3,
  effort: 4,
  progress: 5,
  remaining: 6,
  start: 7,
  end: 8,
  due: 9,
  status: 10,
} as const;

/** ガントの最初の列（K 列 = 11）。タスク表の列のすぐ右 */
const FIRST_DAY_COLUMN = TABLE_COLUMNS.length + 1;

/** ガントの1日の幅（画面案②の px） */
const DAY_WIDTH_PX = 14;

/** 行の番号。6行目から下にタスクを並べる */
const ROW = {
  title: 1,
  conditions: 2,
  month: 3,
  day: 4,
  weekday: 5,
  firstTask: 6,
} as const;

/** 行の高さ。画面案②の 20px を pt にした値（1pt = 4/3px なので 20 × 0.75 = 15） */
const ROW_HEIGHT_PT = 15;

/**
 * 書体。上司の PC でも同じ見た目になるよう、Windows・Mac の Office に標準で入っている游ゴシックにする
 * （画面の Noto Sans JP は、入っていない PC がある。2026-11-23 決定）。
 */
const FONT_NAME = '游ゴシック';

/**
 * 文字の大きさ（pt）。画面案②の px に 0.75 を掛けて、Excel が扱える 0.5pt 刻みにした値。
 * - title   ：1行目のタイトル（14px）
 * - body    ：タスク表と2行目（11px）
 * - month   ：3行目の月（10px）
 * - day     ：4・5行目の日と曜日（9px）
 */
const FONT_SIZE = {
  title: 10.5,
  body: 8,
  month: 7.5,
  day: 7,
} as const;

/** 優先度の記号（SPEC 3.1、DESIGN.md の Voice & Content Strategy） */
const PRIORITY_SYMBOLS: Record<Priority, string> = {
  high: '!!!',
  mid: '=',
  low: '-',
};

/**
 * 曜日の表示。dayOfWeek() の値（日曜 = 0 … 土曜 = 6）の順に並べる。
 * core/calendar.ts にも同じ表があるが外に出していないので、段階9A では core を触らずにここに持つ
 * （並行の段階どうしで同じファイルを触らない決まり。tasks.md の並行の決まり）。
 */
const WEEKDAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'] as const;

/**
 * 全角スペース。字下げと、タイトル・条件の区切りに使う。
 * 見た目では半角スペースと見分けにくいので、文字そのものではなく '\u3000'（全角スペースの文字コード）で書く。
 */
const FULL_WIDTH_SPACE = '\u3000';

/**
 * 階層の字下げ。階層ごとに全角スペースを1つ足す（architecture.md 9章）。
 * 工程（階層 0）は字下げなし、親 1つ、子 2つ、孫 3つ。
 */
const INDENT = FULL_WIDTH_SPACE;

// ---------------------------------------------------------------------------
// シートの種類（通常・残業）
// ---------------------------------------------------------------------------

/** 1枚のシートの決まり */
interface SheetMode {
  hoursPerDay: HoursPerDay;
  /** シートの名前（Excel の下のタブに出る） */
  sheetName: string;
  /** タイトルの括弧の中に出す名前 */
  titleLabel: string;
}

/** 作るシート。この順に並ぶ（SPEC 3.3） */
export const SHEET_MODES: readonly SheetMode[] = [
  { hoursPerDay: 8, sheetName: 'ガント（通常8h）', titleLabel: '通常 8h' },
  { hoursPerDay: 10, sheetName: 'ガント（残業10h）', titleLabel: '残業 10h' },
];

// ---------------------------------------------------------------------------
// ブックを作る
// ---------------------------------------------------------------------------

/**
 * 表示中のPJTから、Excel のブックを作る（シートは通常 8h と残業 10h の2枚）。
 *
 * @param project 出力するPJT（表示中のPJTだけを出す。SPEC 3.3）
 * @param daysOff 休業日・有給の一覧（全PJT共通）
 * @param today 今日の日付（出力日）。完了予定などを出すカード用の集計（summarizeCards）に渡す。
 *              テストで日付を固定できるよう、引数で受け取る（architecture.md 3章）
 * @returns ExcelJS のブック。ファイルにするときは `workbook.xlsx.writeBuffer()` を使う
 */
export function buildWorkbook(
  project: Project,
  daysOff: readonly DayOff[],
  today: DateString,
): ExcelJS.Workbook {
  // 通常と残業の両方を計算する（完了予定のカードと同じ値を2行目に出すため、両方とも要る）
  const rowsByHours: Record<HoursPerDay, ScheduleRow[]> = {
    8: schedule(project, daysOff, 8),
    10: schedule(project, daysOff, 10),
  };
  const cards = summarizeCards(project, daysOff, rowsByHours[8], rowsByHours[10], today);

  // 表示する日は、残業のシートでも通常 8h の完了予定から決める（SPEC 3.1）。
  // 2枚のシートの日付の列がそろうので、見比べやすい
  const days = listGanttDays(project, daysOff, rowsByHours[8]);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Tsumikiri';

  for (const mode of SHEET_MODES) {
    const forecast = mode.hoursPerDay === 8 ? cards.normal : cards.overtime;
    addGanttSheet(workbook, {
      project,
      days,
      rows: rowsByHours[mode.hoursPerDay],
      mode,
      finishDate: forecast.finishDate,
      totalEffortTenths: cards.totalEffortTenths,
    });
  }
  return workbook;
}

/** 1枚のシートを作るのに必要な値 */
interface SheetInput {
  project: Project;
  days: readonly GanttDay[];
  rows: readonly ScheduleRow[];
  mode: SheetMode;
  /** このモードでの完了予定日。タスクがなければ null */
  finishDate: DateString | null;
  totalEffortTenths: number;
}

/** ガントのシートを1枚足す */
function addGanttSheet(workbook: ExcelJS.Workbook, input: SheetInput): void {
  const sheet = workbook.addWorksheet(input.mode.sheetName, {
    properties: { defaultRowHeight: ROW_HEIGHT_PT },
  });

  // 6行目・K列でウィンドウ枠を固定する（architecture.md 9章）。
  // xSplit は固定する列の数（A〜J の10列）、ySplit は固定する行の数（1〜5行目の5行）。
  // topLeftCell は、固定した枠の右下で最初に見えるセル（K6）
  sheet.views = [
    {
      state: 'frozen',
      xSplit: FIRST_DAY_COLUMN - 1,
      ySplit: ROW.firstTask - 1,
      topLeftCell: sheet.getCell(ROW.firstTask, FIRST_DAY_COLUMN).address,
    },
  ];

  setColumnWidths(sheet, input.days.length);

  // 上から順に書く。どの行も、右端までのすべての日付のセルに罫線とグレーを付ける
  const painter = new DayColumnPainter(input.days, input.project.end);
  writeTitleRows(sheet, input, painter);
  writeMonthRow(sheet, input.days, painter);
  writeHeaderRows(sheet, input.days, painter);
  input.rows.forEach((row, index) => {
    writeTaskRow(sheet, ROW.firstTask + index, row, input, painter);
  });

  // 使った行の高さをそろえる（既定の高さだけだと、Excel によっては文字に合わせて変わるため）
  const lastRow = ROW.firstTask + input.rows.length - 1;
  for (let rowNumber = 1; rowNumber <= lastRow; rowNumber += 1) {
    sheet.getRow(rowNumber).height = ROW_HEIGHT_PT;
  }
}

// ---------------------------------------------------------------------------
// 列の幅
// ---------------------------------------------------------------------------

/**
 * 画面の px を、Excel の列の幅（文字数の単位）に直す。
 *
 * Excel の列の幅は「標準の書体の数字が何文字入るか」で表す。標準の書体の数字1文字は 7px、
 * セルの左右に合わせて 5px の余白があるので、幅 =（px − 5）÷ 7。
 * Excel は小数2桁までで持つので、そこで丸める。
 * （例：48px → 6.14、14px → 1.29）
 */
export function pxToColumnWidth(px: number): number {
  return Math.round(((px - 5) / 7) * 100) / 100;
}

/** タスク表の列と、日付の列の幅を決める */
function setColumnWidths(sheet: ExcelJS.Worksheet, dayCount: number): void {
  TABLE_COLUMNS.forEach((column, index) => {
    sheet.getColumn(index + 1).width = pxToColumnWidth(column.widthPx);
  });
  for (let j = 0; j < dayCount; j += 1) {
    sheet.getColumn(FIRST_DAY_COLUMN + j).width = pxToColumnWidth(DAY_WIDTH_PX);
  }
}

// ---------------------------------------------------------------------------
// セルの見た目の部品
// ---------------------------------------------------------------------------

/** 文字の書式を作る。書体はいつも游ゴシック */
function font(options: {
  size?: number;
  bold?: boolean;
  color?: ExcelColorToken;
}): Partial<ExcelJS.Font> {
  return {
    name: FONT_NAME,
    size: options.size ?? FONT_SIZE.body,
    bold: options.bold ?? false,
    color: { argb: argb(options.color ?? 'on-surface') },
  };
}

/** セルの塗り（単色） */
function solidFill(color: ExcelColorToken): ExcelJS.Fill {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb: argb(color) } };
}

/** 罫線の1本（細い線、excel-grid の色） */
const GRID_LINE: Partial<ExcelJS.Border> = { style: 'thin', color: { argb: argb('excel-grid') } };

/** エンド日の線（2px の太さに近い「中」の線、end-line の色。DESIGN.md Colors） */
const END_LINE: Partial<ExcelJS.Border> = { style: 'medium', color: { argb: argb('end-line') } };

/**
 * セルの罫線。画面案②と同じく、右と下にだけ線を引く。
 * 4辺に引くと、隣のセルの左の線と重なり、エンド日の赤い線が隣の細い線に負けて見えることがあるため。
 *
 * @param endLine true なら、右の線をエンド日の赤い線にする
 */
function cellBorder(endLine: boolean): Partial<ExcelJS.Borders> {
  return { right: endLine ? END_LINE : GRID_LINE, bottom: GRID_LINE };
}

// ---------------------------------------------------------------------------
// 日付の列の共通の見た目（グレーとエンド日の線）
// ---------------------------------------------------------------------------

/**
 * 日付の列のセルに、どの行でも共通の見た目（罫線・土日祝のグレー・エンド日の線）を付ける係。
 * 行ごとの中身（月・日・曜日・バー）は、それぞれの行を書く関数が上から足す。
 */
class DayColumnPainter {
  constructor(
    private readonly days: readonly GanttDay[],
    /** エンド日。空欄なら赤い線は引かない（SPEC 3.1） */
    private readonly projectEnd: DateString | null,
  ) {}

  /**
   * 1行ぶんの日付のセルに、共通の見た目を付ける。
   * @param withDayOffFill 土日祝をグレーにするか（3行目の月だけは、画面案②どおりグレーにしない）
   */
  paintRow(sheet: ExcelJS.Worksheet, rowNumber: number, withDayOffFill = true): void {
    this.days.forEach((day, j) => {
      const cell = sheet.getCell(rowNumber, FIRST_DAY_COLUMN + j);
      cell.border = cellBorder(day.date === this.projectEnd);
      if (withDayOffFill && day.kind !== 'work') {
        cell.fill = solidFill('excel-day-off');
      }
    });
  }
}

/** タスク表の部分（A〜J 列）の1行に、罫線と、必要なら背景色を付ける */
function paintTableCells(
  sheet: ExcelJS.Worksheet,
  rowNumber: number,
  fill: ExcelColorToken | null,
): void {
  for (let column = 1; column <= TABLE_COLUMNS.length; column += 1) {
    const cell = sheet.getCell(rowNumber, column);
    cell.border = cellBorder(false);
    if (fill !== null) {
      cell.fill = solidFill(fill);
    }
  }
}

// ---------------------------------------------------------------------------
// 1〜2行目：タイトルと条件
// ---------------------------------------------------------------------------

/** 空欄のときに出す記号（エンド日が空欄、タスクがなく完了予定がない。2026-11-23 決定） */
const EMPTY_MARK = '—';

/** 1行目のタイトルと、2行目の条件を書く */
function writeTitleRows(
  sheet: ExcelJS.Worksheet,
  input: SheetInput,
  painter: DayColumnPainter,
): void {
  const { project, mode } = input;

  // 1行目：例「社内ポータル刷新 工数ガント（通常 8h）」。PJT名とのあいだは全角スペース（コメントでは半角で書いている）
  const title = sheet.getCell(ROW.title, COL.id);
  title.value = `${project.name}${FULL_WIDTH_SPACE}工数ガント（${mode.titleLabel}）`;
  title.font = font({ size: FONT_SIZE.title, bold: true });

  // 2行目：例「開始日 2026-11-16 エンド日 2026-12-25 完了予定 2027-01-04 総工数 33.5 人日 1人日=8h／1日の稼働=8h」
  // 項目のあいだは全角スペースで区切る（画面案②）
  const conditions = [
    `開始日 ${project.start}`,
    `エンド日 ${project.end ?? EMPTY_MARK}`,
    `完了予定 ${input.finishDate ?? EMPTY_MARK}`,
    `総工数 ${formatTenths(input.totalEffortTenths)} 人日`,
    `1人日=8h／1日の稼働=${mode.hoursPerDay}h`,
  ].join(FULL_WIDTH_SPACE);
  const conditionsCell = sheet.getCell(ROW.conditions, COL.id);
  conditionsCell.value = conditions;
  conditionsCell.font = font({ color: 'on-surface-sub' });

  // タイトルと条件は A 列に書き、右のセルへはみ出して見せる。
  // Excel は、右のセルが空ならそこまで文字を出すので、右のセルには値を入れない（罫線とグレーだけ）
  for (const rowNumber of [ROW.title, ROW.conditions]) {
    paintTableCells(sheet, rowNumber, null);
    painter.paintRow(sheet, rowNumber);
  }
}

/** 0.1人日単位の整数を、小数1桁の文字にする（33.5 人日など） */
function formatTenths(tenths: number): string {
  return (tenths / 10).toFixed(1);
}

// ---------------------------------------------------------------------------
// 3〜5行目：見出し（月・列見出しと日・曜日）
// ---------------------------------------------------------------------------

/**
 * 'YYYY-MM-DD' から月と日の数を取り出す（'2026-12-01' → { month: 12, day: 1 }）。
 * 文字列の決まった位置を読むだけなので、Date を作らない（タイムゾーンでずれない）。
 */
function monthAndDay(date: DateString): { month: number; day: number } {
  return { month: Number(date.slice(5, 7)), day: Number(date.slice(8, 10)) };
}

/** 3行目：月。最初の日と、毎月1日の列に「11月」のように書く */
function writeMonthRow(
  sheet: ExcelJS.Worksheet,
  days: readonly GanttDay[],
  painter: DayColumnPainter,
): void {
  paintTableCells(sheet, ROW.month, null);
  // 月の行は、画面案②どおり土日祝もグレーにしない（月の文字を右へはみ出して見せるため）
  painter.paintRow(sheet, ROW.month, false);

  days.forEach((gd, j) => {
    const { month, day } = monthAndDay(gd.date);
    if (j === 0 || day === 1) {
      const cell = sheet.getCell(ROW.month, FIRST_DAY_COLUMN + j);
      cell.value = `${month}月`;
      cell.font = font({ size: FONT_SIZE.month, bold: true });
      cell.alignment = { horizontal: 'left', vertical: 'middle' };
    }
  });
}

/**
 * 日と曜日の文字の色（DESIGN.md の暦）。
 * - 日曜・祝日・休業日：sunday（赤みの橙）
 * - 土曜：saturday（青）
 * - それ以外：weekdayColor（日の行と曜日の行で違う）
 */
function calendarTextColor(gd: GanttDay, weekdayColor: ExcelColorToken): ExcelColorToken {
  const dow = dayOfWeek(gd.date);
  if (gd.kind === 'off' || dow === 0) {
    return 'sunday';
  }
  if (dow === 6) {
    return 'saturday';
  }
  return weekdayColor;
}

/** 4行目（列見出しと日）と5行目（曜日）を書く */
function writeHeaderRows(
  sheet: ExcelJS.Worksheet,
  days: readonly GanttDay[],
  painter: DayColumnPainter,
): void {
  // タスク表の部分は、2行とも見出しの背景にする。列見出しの文字は4行目にだけ書く
  for (const rowNumber of [ROW.day, ROW.weekday]) {
    paintTableCells(sheet, rowNumber, 'excel-header');
    painter.paintRow(sheet, rowNumber);
  }
  TABLE_COLUMNS.forEach((column, index) => {
    const cell = sheet.getCell(ROW.day, index + 1);
    cell.value = column.header;
    cell.font = font({ bold: true });
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
  });

  days.forEach((gd, j) => {
    const column = FIRST_DAY_COLUMN + j;

    // 4行目：日。祝日・休業日は日付の代わりに「休」と出す（SPEC 5章）
    const dayCell = sheet.getCell(ROW.day, column);
    dayCell.value = gd.kind === 'off' ? '休' : monthAndDay(gd.date).day;
    dayCell.font = font({
      size: FONT_SIZE.day,
      bold: true,
      color: calendarTextColor(gd, 'on-surface'),
    });
    dayCell.alignment = { horizontal: 'center', vertical: 'middle' };

    // 5行目：曜日
    const weekdayCell = sheet.getCell(ROW.weekday, column);
    weekdayCell.value = WEEKDAY_LABELS[dayOfWeek(gd.date)] ?? '';
    weekdayCell.font = font({
      size: FONT_SIZE.day,
      color: calendarTextColor(gd, 'on-surface-sub'),
    });
    weekdayCell.alignment = { horizontal: 'center', vertical: 'middle' };
  });
}

// ---------------------------------------------------------------------------
// 6行目から：タスクの行
// ---------------------------------------------------------------------------

/** バーの色（完了分・残り）。画面と同じ（DESIGN.md の Colors・Components の bar-*） */
interface BarColors {
  done: ExcelColorToken;
  rest: ExcelColorToken;
}

/**
 * 行の種類と状態から、バーの色を決める。
 * - エンド日を超えたもの（状態が「超過」）：赤。工程・親も赤にする
 * - 末端のタスク：青
 * - 親タスク：グレー（残りは parent-rest）
 * - 工程：グレー（残りは phase-rest。画面と同じ色。2026-11-23 決定）
 */
function barColorsOf(row: ScheduleRow): BarColors {
  if (row.status === '超過') {
    return { done: 'error', rest: 'error-soft' };
  }
  if (row.kind === 'phase') {
    return { done: 'parent-done', rest: 'phase-rest' };
  }
  if (!row.leaf) {
    return { done: 'parent-done', rest: 'parent-rest' };
  }
  return { done: 'primary', rest: 'primary-soft' };
}

/** タスクの行の、タスク表の部分に出す名前・優先度・期日（ScheduleRow にない項目） */
interface RowDetails {
  name: string;
  priority: Priority | null;
  due: DateString | null;
}

/** 行の元になった工程・タスクから、名前・優先度・期日を取り出す */
function detailsOf(project: Project, row: ScheduleRow): RowDetails {
  if (row.kind === 'phase') {
    const phase = project.phases.find((p) => p.id === row.key);
    // 工程には優先度と期日がない
    return { name: phase?.name ?? '', priority: null, due: null };
  }
  const location = findTask(project, row.key);
  if (location === null) {
    // schedule が作った行なので、必ず見つかる。見つからないのはプログラムの誤り
    throw new Error(`タスクが見つかりません: ${row.key}`);
  }
  return { name: location.task.name, priority: location.task.priority, due: location.task.due };
}

/** タスクの行を1行書く */
function writeTaskRow(
  sheet: ExcelJS.Worksheet,
  rowNumber: number,
  row: ScheduleRow,
  input: SheetInput,
  painter: DayColumnPainter,
): void {
  const details = detailsOf(input.project, row);
  const isPhase = row.kind === 'phase';
  const isParent = row.kind === 'task' && !row.leaf;

  // 工程と親の行は、太字にして背景に色を付ける（SPEC 3.3）
  const rowFill: ExcelColorToken | null = isPhase
    ? 'phase-row'
    : isParent
      ? 'excel-parent-row'
      : null;
  const bold = isPhase || isParent;

  // エンド日を超えた行の赤字は、画面案②どおり末端の行だけにする（2026-11-23 決定）。
  // 工程・親が超過しても、文字は黒のまま（バーだけ赤くなる）
  const overColor: ExcelColorToken = row.leaf && row.status === '超過' ? 'error' : 'on-surface';

  paintTableCells(sheet, rowNumber, rowFill);

  /** タスク表の1セルを書く */
  const put = (
    column: number,
    value: ExcelJS.CellValue,
    options: {
      align?: 'left' | 'center' | 'right';
      color?: ExcelColorToken;
      bold?: boolean;
      numFmt?: string;
    } = {},
  ): void => {
    const cell = sheet.getCell(rowNumber, column);
    cell.value = value;
    cell.font = font({ bold: options.bold ?? bold, color: options.color ?? 'on-surface' });
    cell.alignment = { horizontal: options.align ?? 'left', vertical: 'middle' };
    if (options.numFmt !== undefined) {
      cell.numFmt = options.numFmt;
    }
  };

  // 状態。期日を超えていれば「・期日超過」を足す（画面案②）
  const statusText = row.overDue ? `${row.status}・期日超過` : row.status;

  put(COL.id, row.label);
  put(COL.name, INDENT.repeat(row.level) + details.name, { color: overColor });
  // 優先度は末端のタスクだけに出す（画面案②）
  put(
    COL.priority,
    row.leaf && details.priority !== null ? PRIORITY_SYMBOLS[details.priority] : null,
    {
      align: 'center',
      bold: true,
    },
  );
  // 工数・進捗・残工数は数値で入れ、表示の形（小数1桁・%）は Excel の書式で付ける。
  // 数値にしておくと、上司が Excel で足し算などに使える
  put(COL.effort, row.effortTenths / 10, { align: 'right', numFmt: '0.0' });
  // 親・工程の進捗率は、画面と同じ決まりで整数%に丸める（100%未満は最大 99%、0%より大きければ最小 1%）
  put(COL.progress, displayProgressPct(row.progressPct) / 100, { align: 'right', numFmt: '0%' });
  put(COL.remaining, row.remainingTenths / 10, { align: 'right', numFmt: '0.0' });
  // 日付は、画面の入力欄と同じ 'YYYY-MM-DD' の文字で出す（DESIGN.md の Voice & Content Strategy）
  put(COL.start, row.startDate, { align: 'center' });
  put(COL.end, row.endDate, { align: 'center', color: overColor });
  put(COL.due, details.due, { align: 'center' });
  put(COL.status, statusText, { color: overColor });

  // ガントの部分：先に共通の見た目（罫線・グレー・エンド日の線）を付けてから、バーのマスを塗る
  painter.paintRow(sheet, rowNumber);
  paintBar(sheet, rowNumber, row, input);
}

/**
 * バーを塗る。1日1セルで、完了分か残りかは画面と同じ barCells で決める（SPEC 3.1・3.3）。
 * barCells は稼働日の番号でマスを返すので、その番号の日が何列目かを探して塗る。
 */
function paintBar(
  sheet: ExcelJS.Worksheet,
  rowNumber: number,
  row: ScheduleRow,
  input: SheetInput,
): void {
  const colors = barColorsOf(row);

  // 稼働日の番号 → 列の番号 の表。土日祝の列は稼働日の番号を持たないので、表に入らない
  const columnByWorkday = new Map<number, number>();
  input.days.forEach((gd, j) => {
    if (gd.workdayIndex !== null) {
      columnByWorkday.set(gd.workdayIndex, FIRST_DAY_COLUMN + j);
    }
  });

  for (const barCell of barCells(row, input.mode.hoursPerDay)) {
    const column = columnByWorkday.get(barCell.workdayIndex);
    // 表示する期間は通常 8h の完了予定より後まであるので、ふつうは必ず見つかる。念のため、なければ塗らない
    if (column === undefined) {
      continue;
    }
    sheet.getCell(rowNumber, column).fill = solidFill(barCell.done ? colors.done : colors.rest);
  }
}
