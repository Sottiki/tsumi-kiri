/**
 * テスト用のデータを短く作るための関数。
 *
 * test-cases.md の例は「工数 3.5」「進捗 60%」のように人の読む形で書いてあるので、
 * ここで受け取ってメモリの形（effortTenths: 35、progressPct: 60）に直す。
 * テストでは保存する形を通さず、ここで直接メモリの形に変換する（変換そのものは tests/storage.test.ts で確かめる）。
 */

import { schedule } from '../src/core/schedule';
import type {
  DateString,
  HoursPerDay,
  DayOff,
  Phase,
  PhaseId,
  Project,
  ScheduleRow,
  Task,
} from '../src/core/types';

/** タスクを作るときに指定できる項目。省略したものは既定値（工数 0・進捗 0%・期日なし）になる */
interface TaskInput {
  /** 工数（人日）。例：3.5 */
  effort?: number;
  /** 進捗率（%）。例：60 */
  progress?: number;
  due?: DateString | null;
  children?: Task[];
}

/** テストの中で id が重ならないように振る番号 */
let nextId = 1;

/** タスクを作る */
export function task(name: string, input: TaskInput = {}): Task {
  return {
    id: `t${nextId++}`,
    name,
    effortTenths: Math.round((input.effort ?? 0) * 10),
    progressPct: input.progress ?? 0,
    priority: 'mid',
    due: input.due ?? null,
    memo: '',
    children: input.children ?? [],
  };
}

const PHASES: { id: PhaseId; name: string }[] = [
  { id: 'req', name: '要件定義' },
  { id: 'design', name: '設計' },
  { id: 'impl', name: '実装' },
  { id: 'test', name: 'テスト' },
  { id: 'release', name: 'リリース' },
];

/**
 * PJTを作る。tasksByPhase は工程の順（要件定義・設計・実装・テスト・リリース）に、
 * それぞれのタスクの配列を並べる。足りない工程は空になる。
 */
export function project(options: {
  start?: DateString;
  end?: DateString | null;
  tasksByPhase: Task[][];
}): Project {
  const phases: Phase[] = PHASES.map((phase, i) => ({
    ...phase,
    tasks: options.tasksByPhase[i] ?? [],
  }));
  return {
    id: 'p1',
    name: 'テスト用PJT',
    start: options.start ?? '2026-11-16',
    // end を書かなければ 2026-12-25。null を渡せば空欄
    end: options.end === undefined ? '2026-12-25' : options.end,
    overtime: false,
    phases,
  };
}

/** 計算して、行を ID（'1-2-1'）で引ける Map にする */
export function scheduleByLabel(
  pjt: Project,
  hoursPerDay: HoursPerDay,
  daysOff: DayOff[] = [],
): Map<string, ScheduleRow> {
  const rows = schedule(pjt, daysOff, hoursPerDay);
  return new Map(rows.map((row) => [row.label, row]));
}

/** Map から行を取り出す。なければテストを失敗させる */
export function rowOf(rows: Map<string, ScheduleRow>, label: string): ScheduleRow {
  const row = rows.get(label);
  if (row === undefined) {
    throw new Error(`行 ${label} がありません`);
  }
  return row;
}

/**
 * 画面案のデータ（test-cases.md 1章）。
 * 開始日 2026-11-16、エンド日 2026-12-25。
 */
export function mockupProject(): Project {
  return project({
    tasksByPhase: [
      [
        task('現状ヒアリング', { effort: 2.0, progress: 100 }),
        task('要件定義書作成', { effort: 3.0, progress: 60 }),
      ],
      [
        task('基本設計', {
          children: [task('画面設計', { effort: 3.0 }), task('DB設計', { effort: 2.0 })],
        }),
        task('詳細設計', { effort: 4.0 }),
      ],
      [
        task('フロント実装', {
          children: [
            task('一覧画面', { effort: 4.0 }),
            task('詳細画面', { effort: 3.5, due: '2026-12-18' }),
          ],
        }),
        task('API実装', { effort: 5.0 }),
      ],
      [task('結合テスト', { effort: 4.0 }), task('受入テスト対応', { effort: 2.0 })],
      [task('本番リリース', { effort: 1.0, due: '2026-12-25' })],
    ],
  });
}
