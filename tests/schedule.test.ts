/**
 * 日程の計算（core/schedule.ts）のテスト。
 * docs/test-cases.md の例を、ID（TC-01 など）ごとにそのままテストにする。
 */

import { describe, expect, it } from 'vitest';
import {
  barCells,
  buildWarnings,
  displayProgressPct,
  listGanttDays,
  schedule,
  summarizeCards,
  type HoursPerDay,
} from '../src/core/schedule';
import type { Project, ScheduleRow } from '../src/core/types';
import { mockupProject, project, rowOf, scheduleByLabel, task } from './helpers';

/**
 * 行の位置を「稼働日の単位」（test-cases.md の書き方。例：2 – 5）にして返す。
 * 行は 0.1時間単位の整数で持っているので、1日の長さ（80 ／ 100）で割る。
 */
function positionInDays(row: ScheduleRow, hoursPerDay: HoursPerDay): [number, number] {
  const dayLen = hoursPerDay * 10;
  return [(row.start as number) / dayLen, (row.end as number) / dayLen];
}

/** 開始日と終了日を [開始, 終了] にして返す */
function dates(row: ScheduleRow): [string | null, string | null] {
  return [row.startDate, row.endDate];
}

/** 通常と残業の両方で計算し、カードの値も作る */
function scheduleBoth(pjt: Project, today = '2026-11-19') {
  const normalRows = schedule(pjt, [], 8);
  const overtimeRows = schedule(pjt, [], 10);
  const cards = summarizeCards(pjt, [], normalRows, overtimeRows, today);
  return { normalRows, overtimeRows, cards };
}

// ---------------------------------------------------------------------------
// 1章 画面案のデータ（総合）
// ---------------------------------------------------------------------------

describe('画面案のデータ（test-cases.md 1章）', () => {
  const pjt = mockupProject();
  const normal = scheduleByLabel(pjt, 8);
  const overtime = scheduleByLabel(pjt, 10);

  it('TC-01 末端タスクの日程（通常 8h／残業 10h）', () => {
    // [ID, 通常の位置, 通常の開始 → 終了, 残業の位置, 残業の開始 → 終了]
    const expected: [
      string,
      [number, number],
      [string, string],
      [number, number],
      [string, string],
    ][] = [
      ['1-1', [0, 2], ['2026-11-16', '2026-11-17'], [0, 1.6], ['2026-11-16', '2026-11-17']],
      ['1-2', [2, 5], ['2026-11-18', '2026-11-20'], [1.6, 4.0], ['2026-11-17', '2026-11-19']],
      ['2-1-1', [5, 8], ['2026-11-24', '2026-11-26'], [4.0, 6.4], ['2026-11-20', '2026-11-25']],
      ['2-1-2', [8, 10], ['2026-11-27', '2026-11-30'], [6.4, 8.0], ['2026-11-25', '2026-11-26']],
      ['2-2', [10, 14], ['2026-12-01', '2026-12-04'], [8.0, 11.2], ['2026-11-27', '2026-12-02']],
      ['3-1-1', [14, 18], ['2026-12-07', '2026-12-10'], [11.2, 14.4], ['2026-12-02', '2026-12-07']],
      [
        '3-1-2',
        [18, 21.5],
        ['2026-12-11', '2026-12-16'],
        [14.4, 17.2],
        ['2026-12-07', '2026-12-10'],
      ],
      [
        '3-2',
        [21.5, 26.5],
        ['2026-12-16', '2026-12-23'],
        [17.2, 21.2],
        ['2026-12-10', '2026-12-16'],
      ],
      [
        '4-1',
        [26.5, 30.5],
        ['2026-12-23', '2026-12-29'],
        [21.2, 24.4],
        ['2026-12-16', '2026-12-21'],
      ],
      [
        '4-2',
        [30.5, 32.5],
        ['2026-12-29', '2026-12-31'],
        [24.4, 26.0],
        ['2026-12-21', '2026-12-22'],
      ],
      [
        '5-1',
        [32.5, 33.5],
        ['2026-12-31', '2027-01-04'],
        [26.0, 26.8],
        ['2026-12-23', '2026-12-23'],
      ],
    ];
    for (const [label, nPos, nDates, oPos, oDates] of expected) {
      const n = rowOf(normal, label);
      const o = rowOf(overtime, label);
      expect(positionInDays(n, 8), `${label} 通常の位置`).toEqual(nPos);
      expect(dates(n), `${label} 通常の日程`).toEqual(nDates);
      expect(positionInDays(o, 10), `${label} 残業の位置`).toEqual(oPos);
      expect(dates(o), `${label} 残業の日程`).toEqual(oDates);
    }
  });

  it('TC-02 親と工程の集計（通常 8h）', () => {
    // [ID, 工数（0.1人日）, 進捗率（表示）, 残工数（0.1人日）, 開始 → 終了, 状態]
    const expected: [string, number, number, number, [string, string], string][] = [
      ['1', 50, 80, 12, ['2026-11-16', '2026-11-20'], '進行中'],
      ['2', 90, 0, 90, ['2026-11-24', '2026-12-04'], '未着手'],
      ['2-1', 50, 0, 50, ['2026-11-24', '2026-11-30'], '未着手'],
      ['3', 125, 0, 125, ['2026-12-07', '2026-12-23'], '未着手'],
      ['3-1', 75, 0, 75, ['2026-12-07', '2026-12-16'], '未着手'],
      ['4', 60, 0, 60, ['2026-12-23', '2026-12-31'], '超過'],
      ['5', 10, 0, 10, ['2026-12-31', '2027-01-04'], '超過'],
    ];
    for (const [label, effort, progress, remaining, range, status] of expected) {
      const row = rowOf(normal, label);
      expect(row.leaf, label).toBe(false);
      expect(row.effortTenths, `${label} 工数`).toBe(effort);
      expect(displayProgressPct(row.progressPct), `${label} 進捗率`).toBe(progress);
      expect(row.remainingTenths, `${label} 残工数`).toBe(remaining);
      expect(dates(row), `${label} 期間`).toEqual(range);
      expect(row.status, `${label} 状態`).toBe(status);
    }
    // 要件定義の進捗率は 100% と 60% の単純平均
    expect(rowOf(normal, '1').progressPct).toBe(80);
  });

  it('TC-03 末端タスクの状態と期日超過（通常 8h）', () => {
    const expected: Record<string, [string, boolean]> = {
      '1-1': ['完了', false],
      '1-2': ['進行中', false],
      '2-1-1': ['未着手', false],
      '2-1-2': ['未着手', false],
      '2-2': ['未着手', false],
      '3-1-1': ['未着手', false],
      '3-1-2': ['未着手', false], // 終了 12/16 は期日 12/18 より前
      '3-2': ['未着手', false],
      '4-1': ['超過', false],
      '4-2': ['超過', false],
      '5-1': ['超過', true], // 終了 1/4 は期日 12/25 も超えている
    };
    for (const [label, [status, overDue]] of Object.entries(expected)) {
      const row = rowOf(normal, label);
      expect(row.status, `${label} 状態`).toBe(status);
      expect(row.overDue, `${label} 期日超過`).toBe(overDue);
    }
  });

  it('TC-03 残業 10h では、超過も期日超過もない', () => {
    for (const row of overtime.values()) {
      expect(row.status, row.label).not.toBe('超過');
      expect(row.overDue, row.label).toBe(false);
    }
  });

  it('TC-04 上部のカード', () => {
    const { cards } = scheduleBoth(pjt);
    // 総工数
    expect(cards.totalEffortTenths).toBe(335);
    expect(displayProgressPct(cards.progressPct)).toBe(16);
    expect(cards.remainingTenths).toBe(297);
    // エンド日
    expect(cards.endDate).toBe('2026-12-25');
    expect(cards.workdaysUntilEnd).toBe(25);
    // 完了予定（通常 8h）：エンド日を 5 営業日超過
    expect(cards.normal).toEqual({ finishDate: '2027-01-04', overrunWorkdays: 5 });
    // 完了予定（残業 10h）：エンド日に間に合う（超過 0）、残業なら 7 営業日短縮
    expect(cards.overtime).toEqual({ finishDate: '2026-12-23', overrunWorkdays: 0 });
    expect(cards.shortenedWorkdays).toBe(7);
  });

  it('TC-05 詳細パネルの警告：4-1（エンド日だけ超過）', () => {
    const warnings = buildWarnings(null, pjt.end, [], rowOf(normal, '4-1'), rowOf(overtime, '4-1'));
    expect(warnings).toEqual([
      {
        kind: 'end',
        title: '終了予定 12/29(火) はエンド日 12/25 を 2 営業日超えています',
        detail: '残業 10h なら 12/21(月) に終わり、エンド日に間に合います。',
      },
    ]);
  });

  it('TC-05 詳細パネルの警告：5-1（期日もエンド日も超過。同じ日付でもまとめない）', () => {
    const warnings = buildWarnings(
      '2026-12-25',
      pjt.end,
      [],
      rowOf(normal, '5-1'),
      rowOf(overtime, '5-1'),
    );
    expect(warnings).toEqual([
      {
        kind: 'due',
        title: '終了予定 1/4(月) は期日 12/25 を 5 営業日超えています',
        detail: '残業 10h なら 12/23(水) に終わり、期日に間に合います。',
      },
      {
        kind: 'end',
        title: '終了予定 1/4(月) はエンド日 12/25 を 5 営業日超えています',
        detail: '残業 10h なら 12/23(水) に終わり、エンド日に間に合います。',
      },
    ]);
  });

  it('TC-05 超えていないタスクには警告を出さない', () => {
    expect(buildWarnings(null, pjt.end, [], rowOf(normal, '1-2'), rowOf(overtime, '1-2'))).toEqual(
      [],
    );
  });

  it('TC-06 ガントの表示期間：エンド日と完了予定（通常）の遅い方の1週間後まで', () => {
    const days = listGanttDays(pjt, [], schedule(pjt, [], 8));
    expect(days[0]?.date).toBe('2026-11-16');
    expect(days.at(-1)?.date).toBe('2027-01-11');
    // 土日祝も含めて、暦の上のすべての日を並べる（11/16〜1/11 は 57 日）
    expect(days).toHaveLength(57);
  });

  it('TC-06 ガントの日には、日の種類と稼働日の番号が付く', () => {
    const days = listGanttDays(pjt, [], schedule(pjt, [], 8));
    const byDate = new Map(days.map((day) => [day.date, day]));
    expect(byDate.get('2026-11-20')).toEqual({ date: '2026-11-20', kind: 'work', workdayIndex: 4 });
    expect(byDate.get('2026-11-21')).toEqual({
      date: '2026-11-21',
      kind: 'weekend',
      workdayIndex: null,
    });
    expect(byDate.get('2026-11-23')).toEqual({
      date: '2026-11-23',
      kind: 'off',
      workdayIndex: null,
    });
    expect(byDate.get('2026-11-24')).toEqual({ date: '2026-11-24', kind: 'work', workdayIndex: 5 });
  });

  it('TC-07 バーの塗り分け（1-2、通常 8h）：真ん中が境目 3.8 より前なら完了分', () => {
    expect(barCells(rowOf(normal, '1-2'), 8)).toEqual([
      { workdayIndex: 2, done: true }, // 11/18（真ん中 2.5）
      { workdayIndex: 3, done: true }, // 11/19（真ん中 3.5）
      { workdayIndex: 4, done: false }, // 11/20（真ん中 4.5）
    ]);
  });

  it('TC-41 ID は並び順から作る', () => {
    const labels = schedule(pjt, [], 8).map((row) => row.label);
    expect(labels).toEqual([
      '1',
      '1-1',
      '1-2',
      '2',
      '2-1',
      '2-1-1',
      '2-1-2',
      '2-2',
      '3',
      '3-1',
      '3-1-1',
      '3-1-2',
      '3-2',
      '4',
      '4-1',
      '4-2',
      '5',
      '5-1',
    ]);
  });

  it('TC-41 階層は工程 0、親 1、子 2', () => {
    const rows = scheduleByLabel(pjt, 8);
    expect(rowOf(rows, '2').level).toBe(0);
    expect(rowOf(rows, '2').kind).toBe('phase');
    expect(rowOf(rows, '2-1').level).toBe(1);
    expect(rowOf(rows, '2-1-1').level).toBe(2);
    expect(rowOf(rows, '2-1-1').leaf).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 2章 小さな例
// ---------------------------------------------------------------------------

describe('小さな例（test-cases.md 2章）', () => {
  /** 要件定義の工程に、工数だけを並べたPJTを作る */
  function simple(efforts: number[], options: Partial<Parameters<typeof project>[0]> = {}) {
    return project({
      ...options,
      tasksByPhase: [efforts.map((effort, i) => task(`タスク${i + 1}`, { effort }))],
    });
  }

  it('TC-11 1日ちょうど', () => {
    const rows = scheduleByLabel(simple([1.0]), 8);
    expect(dates(rowOf(rows, '1-1'))).toEqual(['2026-11-16', '2026-11-16']);
  });

  it('TC-12 日の途中から始まる', () => {
    const rows = scheduleByLabel(simple([0.5, 0.5, 1.0]), 8);
    expect(dates(rowOf(rows, '1-1'))).toEqual(['2026-11-16', '2026-11-16']);
    expect(dates(rowOf(rows, '1-2'))).toEqual(['2026-11-16', '2026-11-16']);
    expect(positionInDays(rowOf(rows, '1-2'), 8)).toEqual([0.5, 1.0]);
    expect(dates(rowOf(rows, '1-3'))).toEqual(['2026-11-17', '2026-11-17']);
  });

  it('TC-13 土日と祝日をまたぐ', () => {
    const rows = scheduleByLabel(simple([3.0], { start: '2026-11-19' }), 8);
    expect(dates(rowOf(rows, '1-1'))).toEqual(['2026-11-19', '2026-11-24']);
  });

  it('TC-14 開始日が休日なら、最初の稼働日から積む', () => {
    const rows = scheduleByLabel(simple([1.0], { start: '2026-11-21' }), 8);
    expect(dates(rowOf(rows, '1-1'))).toEqual(['2026-11-24', '2026-11-24']);
  });

  it('TC-15 休業日を飛ばす', () => {
    const rows = scheduleByLabel(simple([3.0, 1.0], { start: '2026-12-24' }), 8, [
      { date: '2026-12-28', label: '年末休業' },
    ]);
    expect(dates(rowOf(rows, '1-1'))).toEqual(['2026-12-24', '2026-12-29']);
    expect(dates(rowOf(rows, '1-2'))).toEqual(['2026-12-30', '2026-12-30']);
  });

  it('TC-16 工数0のタスクは、その位置を含む稼働日。バーは描かない', () => {
    const rows = scheduleByLabel(simple([1.0, 0, 1.0]), 8);
    const zero = rowOf(rows, '1-2');
    expect(positionInDays(zero, 8)).toEqual([1, 1]);
    expect(dates(zero)).toEqual(['2026-11-17', '2026-11-17']);
    expect(barCells(zero, 8)).toEqual([]);
    expect(dates(rowOf(rows, '1-3'))).toEqual(['2026-11-17', '2026-11-17']);
  });

  it('TC-17 残業 10h', () => {
    const rows = scheduleByLabel(simple([1.0, 1.0]), 10);
    expect(positionInDays(rowOf(rows, '1-1'), 10)).toEqual([0, 0.8]);
    expect(dates(rowOf(rows, '1-1'))).toEqual(['2026-11-16', '2026-11-16']);
    expect(positionInDays(rowOf(rows, '1-2'), 10)).toEqual([0.8, 1.6]);
    expect(dates(rowOf(rows, '1-2'))).toEqual(['2026-11-16', '2026-11-17']);
  });

  it('TC-18 小数の誤差が出ない（工数 0.1 を10件）', () => {
    const pjt = simple(Array.from({ length: 10 }, () => 0.1));
    const normal = rowOf(scheduleByLabel(pjt, 8), '1-10');
    // 位置は整数で持つので、0.9 – 1.0 日はちょうど 72 – 80（0.1時間単位）
    expect([normal.start, normal.end]).toEqual([72, 80]);
    expect(dates(normal)).toEqual(['2026-11-16', '2026-11-16']);

    const overtime = rowOf(scheduleByLabel(pjt, 10), '1-10');
    expect([overtime.start, overtime.end]).toEqual([72, 80]); // 0.72 – 0.8 日（1日 = 100）
    expect(dates(overtime)).toEqual(['2026-11-16', '2026-11-16']);
  });

  it('TC-19 期日超過の境目：同じ日は超えていない', () => {
    const onTime = project({ tasksByPhase: [[task('A', { effort: 2.0, due: '2026-11-17' })]] });
    expect(rowOf(scheduleByLabel(onTime, 8), '1-1').overDue).toBe(false);

    const late = project({ tasksByPhase: [[task('A', { effort: 2.0, due: '2026-11-16' })]] });
    const lateRow = rowOf(scheduleByLabel(late, 8), '1-1');
    expect(lateRow.overDue).toBe(true);
    // 1営業日超え（11/17）。警告の日数で確かめる
    const [warning] = buildWarnings(
      '2026-11-16',
      late.end,
      [],
      lateRow,
      rowOf(scheduleByLabel(late, 10), '1-1'),
    );
    expect(warning?.title).toBe('終了予定 11/17(火) は期日 11/16 を 1 営業日超えています');
  });

  it('TC-20 エンド日超過の日数', () => {
    const pjt = simple([5.0], { end: '2026-11-16' });
    const { normalRows, cards } = scheduleBoth(pjt);
    const row = normalRows.find((r) => r.label === '1-1') as ScheduleRow;
    expect(row.endDate).toBe('2026-11-20');
    expect(row.status).toBe('超過');
    expect(cards.normal.overrunWorkdays).toBe(4); // 11/17〜11/20
  });

  it('TC-21 エンド日が空欄なら、どのタスクも超過にならず、カードは「エンド日未設定」', () => {
    const pjt = simple([50.0], { end: null });
    const { normalRows, overtimeRows, cards } = scheduleBoth(pjt);
    for (const row of [...normalRows, ...overtimeRows]) {
      expect(row.status, row.label).not.toBe('超過');
    }
    expect(cards.endDate).toBeNull();
    expect(cards.workdaysUntilEnd).toBeNull();
    // 完了予定の日付は出すが、間に合うかの判定（超過日数）は null ＝「エンド日未設定」
    expect(cards.normal.finishDate).not.toBeNull();
    expect(cards.normal.overrunWorkdays).toBeNull();
    expect(cards.overtime.overrunWorkdays).toBeNull();
  });

  it('TC-22 状態の優先順位：進捗 100% なら、エンド日を超えていても完了', () => {
    const make = (progress: number) =>
      project({
        end: '2026-11-16',
        tasksByPhase: [[task('A', { effort: 1.0 }), task('B', { effort: 1.0, progress })]],
      });
    const done = rowOf(scheduleByLabel(make(100), 8), '1-2');
    expect(done.endDate).toBe('2026-11-17');
    expect(done.status).toBe('完了');

    // 90% に戻すと超過になる
    expect(rowOf(scheduleByLabel(make(90), 8), '1-2').status).toBe('超過');
  });

  it('TC-23 進捗は日程に影響しない', () => {
    const make = (progress: number) =>
      project({
        tasksByPhase: [
          [
            task('A', { effort: 0.5, progress }),
            task('B', { effort: 0.5 }),
            task('C', { effort: 1.0 }),
          ],
        ],
      });
    const before = schedule(make(0), [], 8).map((row) => [row.start, row.end, ...dates(row)]);
    const after = schedule(make(100), [], 8).map((row) => [row.start, row.end, ...dates(row)]);
    expect(after).toEqual(before);
  });

  it('TC-24 完了したら期日超過を消す', () => {
    const make = (progress: number) =>
      project({ tasksByPhase: [[task('A', { effort: 2.0, due: '2026-11-16', progress })]] });
    const done = rowOf(scheduleByLabel(make(100), 8), '1-1');
    expect(done.status).toBe('完了');
    expect(done.overDue).toBe(false);
    expect(rowOf(scheduleByLabel(make(90), 8), '1-1').overDue).toBe(true);
  });

  it('TC-25 ちょうど半分の日は残り（薄い色）', () => {
    const make = (progress: number) =>
      project({ tasksByPhase: [[task('A', { effort: 1.0, progress })]] });
    expect(barCells(rowOf(scheduleByLabel(make(50), 8), '1-1'), 8)).toEqual([
      { workdayIndex: 0, done: false },
    ]);
    expect(barCells(rowOf(scheduleByLabel(make(51), 8), '1-1'), 8)).toEqual([
      { workdayIndex: 0, done: true },
    ]);
  });

  it('TC-26 日の途中から始まるバーの塗り分け（残業、位置 0.8 – 1.6）', () => {
    const make = (progress: number) =>
      project({
        tasksByPhase: [[task('A', { effort: 1.0 }), task('B', { effort: 1.0, progress })]],
      });
    const cellsOf = (progress: number) =>
      barCells(rowOf(scheduleByLabel(make(progress), 10), '1-2'), 10);

    expect(cellsOf(0)).toEqual([
      { workdayIndex: 0, done: false },
      { workdayIndex: 1, done: false },
    ]);
    // 境目 1.2。11/16（真ん中 0.9）は完了分、11/17（真ん中 1.3）は残り
    expect(cellsOf(50)).toEqual([
      { workdayIndex: 0, done: true },
      { workdayIndex: 1, done: false },
    ]);
    expect(cellsOf(100)).toEqual([
      { workdayIndex: 0, done: true },
      { workdayIndex: 1, done: true },
    ]);
  });

  it('TC-27 日の途中で終わるバーも、その日のマスを丸ごと塗る', () => {
    const rows = scheduleByLabel(simple([1.1, 1.0]), 8);
    const first = rowOf(rows, '1-1');
    const second = rowOf(rows, '1-2');
    expect(dates(first)).toEqual(['2026-11-16', '2026-11-17']);
    expect(barCells(first, 8).map((cell) => cell.workdayIndex)).toEqual([0, 1]);
    expect(positionInDays(second, 8)).toEqual([1.1, 2.1]);
    expect(dates(second)).toEqual(['2026-11-17', '2026-11-18']);
    // 11/17（1番）のマスには両方のバーが出る
    expect(barCells(second, 8).map((cell) => cell.workdayIndex)).toEqual([1, 2]);
  });

  it('TC-28 残業でも超えるときは、何営業日超えるかを書く', () => {
    const pjt = simple([3.0], { end: '2026-11-17' });
    const normalRow = rowOf(scheduleByLabel(pjt, 8), '1-1');
    const overtimeRow = rowOf(scheduleByLabel(pjt, 10), '1-1');
    expect(buildWarnings(null, pjt.end, [], normalRow, overtimeRow)).toEqual([
      {
        kind: 'end',
        title: '終了予定 11/18(水) はエンド日 11/17 を 1 営業日超えています',
        detail: '残業 10h でも 11/18(水) に終わり、エンド日を 1 営業日超えます。',
      },
    ]);
  });

  it('TC-29 表示期間：エンド日やタスクがないとき', () => {
    const lastDay = (pjt: Project) => listGanttDays(pjt, [], schedule(pjt, [], 8)).at(-1)?.date;
    // (a) エンド日なし：完了予定 11/16 の1週間後
    expect(lastDay(simple([1.0], { end: null }))).toBe('2026-11-23');
    // (b) タスクなし：エンド日 12/25 の1週間後
    expect(lastDay(project({ tasksByPhase: [] }))).toBe('2027-01-01');
    // (c) どちらもなし：開始日の1週間後
    expect(lastDay(project({ end: null, tasksByPhase: [] }))).toBe('2026-11-23');
  });

  it('TC-30 エンド日までの営業日：今日がエンド日と同じか後なら 0', () => {
    const pjt = simple([1.0]);
    expect(scheduleBoth(pjt, '2026-12-25').cards.workdaysUntilEnd).toBe(0);
    expect(scheduleBoth(pjt, '2026-12-28').cards.workdaysUntilEnd).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 3章 集計の例
// ---------------------------------------------------------------------------

describe('集計の例（test-cases.md 3章）', () => {
  it('TC-31 親の進捗は子の単純平均、残工数は子の合計', () => {
    const pjt = project({
      tasksByPhase: [
        [
          task('P', {
            children: [task('A', { effort: 1.0, progress: 50 }), task('B', { effort: 9.0 })],
          }),
        ],
      ],
    });
    const parent = rowOf(scheduleByLabel(pjt, 8), '1-1');
    expect(parent.progressPct).toBe(25);
    expect(parent.effortTenths).toBe(100);
    expect(parent.remainingTenths).toBe(95); // 0.5 + 9.0。10.0 × 75% = 7.5 ではない
  });

  it('TC-32 孫がある場合は、子の値を先に出してから平均する', () => {
    const pjt = project({
      tasksByPhase: [
        [
          task('P', {
            children: [
              task('A', { effort: 1.0, progress: 50 }),
              task('B', {
                children: [task('B1', { effort: 1.0, progress: 100 }), task('B2', { effort: 1.0 })],
              }),
            ],
          }),
        ],
      ],
    });
    const rows = scheduleByLabel(pjt, 8);
    expect(rowOf(rows, '1-1-2').progressPct).toBe(50); // B
    expect(rowOf(rows, '1-1').progressPct).toBe(50); // P = (50 + 50) ÷ 2
    expect(rowOf(rows, '1-1-2-1').level).toBe(3); // 孫
  });

  it('TC-33 タスクのない工程は帯だけ。PJT全体の進捗の平均に入れない', () => {
    const pjt = project({ tasksByPhase: [[], [task('A', { effort: 1.0, progress: 40 })]] });
    const { normalRows, cards } = scheduleBoth(pjt);
    const empty = normalRows.find((row) => row.label === '1') as ScheduleRow;
    expect(empty.effortTenths).toBe(0);
    expect(dates(empty)).toEqual([null, null]);
    expect([empty.start, empty.end]).toEqual([null, null]);
    expect(barCells(empty, 8)).toEqual([]);
    expect(empty.status).toBe('未着手');
    expect(cards.progressPct).toBe(40);
  });

  it('TC-34 工程は直列に積む', () => {
    const pjt = project({
      tasksByPhase: [[task('A', { effort: 2.0 })], [task('B', { effort: 1.0 })]],
    });
    expect(dates(rowOf(scheduleByLabel(pjt, 8), '2-1'))).toEqual(['2026-11-18', '2026-11-18']);
  });

  it('TC-36 残工数は末端で丸めてから足す', () => {
    const pjt = project({
      tasksByPhase: [
        [
          task('P', {
            children: [
              task('A1', { effort: 3.5, progress: 33 }),
              task('A2', { effort: 3.5, progress: 33 }),
            ],
          }),
        ],
      ],
    });
    const rows = scheduleByLabel(pjt, 8);
    expect(rowOf(rows, '1-1-1').remainingTenths).toBe(23); // 2.345 → 2.3
    expect(rowOf(rows, '1-1-2').remainingTenths).toBe(23);
    expect(rowOf(rows, '1-1').remainingTenths).toBe(46); // 4.69 を丸めた 4.7 ではない
  });

  it('TC-37 残工数の四捨五入', () => {
    const pjt = project({ tasksByPhase: [[task('A', { effort: 1.5, progress: 70 })]] });
    expect(rowOf(scheduleByLabel(pjt, 8), '1-1').remainingTenths).toBe(5); // 0.45 → 0.5
  });

  it('TC-38 親の進捗率の表示', () => {
    const parentOf = (progresses: number[]) => {
      const children = progresses.map((progress, i) =>
        task(`子${i + 1}`, { effort: 1.0, progress }),
      );
      const pjt = project({ tasksByPhase: [[task('P', { children })]] });
      return rowOf(scheduleByLabel(pjt, 8), '1-1');
    };

    // (a) 平均 99.5% だが表示は 99%、状態は進行中
    const a = parentOf([100, 99]);
    expect(a.progressPct).toBe(99.5);
    expect(displayProgressPct(a.progressPct)).toBe(99);
    expect(a.status).toBe('進行中');

    // (b) 平均 0.5% だが表示は 1%、状態は進行中
    const b = parentOf([1, 0]);
    expect(b.progressPct).toBe(0.5);
    expect(displayProgressPct(b.progressPct)).toBe(1);
    expect(b.status).toBe('進行中');

    // (c) 平均 33.3…% で表示は 33%
    const c = parentOf([100, 0, 0]);
    expect(displayProgressPct(c.progressPct)).toBe(33);
  });

  it('子がすべて 100% の親は完了、すべて 0% なら 0% と表示', () => {
    expect(displayProgressPct(100)).toBe(100);
    expect(displayProgressPct(0)).toBe(0);
    const pjt = project({
      tasksByPhase: [
        [
          task('P', {
            children: [
              task('A', { effort: 1.0, progress: 100 }),
              task('B', { effort: 1.0, progress: 100 }),
            ],
          }),
        ],
      ],
    });
    expect(rowOf(scheduleByLabel(pjt, 8), '1-1').status).toBe('完了');
  });
});
