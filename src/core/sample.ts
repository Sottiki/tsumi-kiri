/**
 * サンプルPJT（tasks.md 段階2：2-8、SPEC 3.1「初めて開いたとき」）
 *
 * 初めて開いたとき（保存データがないとき）に表示するPJT。
 * ポートフォリオで見た人にも動きが伝わるよう、画面案と同じデータを入れる。
 * 中身は docs/test-cases.md 1章の表と同じ（優先度とメモは画面案から）。
 *
 * ■ 日付のずらし方（SPEC 3.1、決定事項35）
 * 画面案は「開始日 2026-11-16(月)、今日 2026-11-19(木)」で作ってある。
 * そのままの日付で出すと、何か月か後に開いた人には、すべて過去の日付になってしまう。
 * そこで、開始日を「開いた日を含む週の月曜」にずらし、エンド日と期日も同じ日数だけずらす。
 * ずらす日数は必ず7の倍数になるので、曜日は画面案と同じになる。
 * （祝日の位置は年によって違うので、日程の結果までは画面案と同じにはならない）
 *
 * React にも DOM にも依存しない（architecture.md 2章）。
 */

import { addDays, daysBetween, mondayOfWeek } from './calendar';
import { CURRENT_VERSION } from './storage';
import { createTask, PHASES, type IdGenerator, newId } from './tree';
import type { AppData, DateString, PhaseId, Priority, Project, Task } from './types';

/** 画面案の開始日（月曜）。ここから何日ずらすかを決める基準 */
const BASE_START = '2026-11-16';
/** 画面案のエンド日 */
const BASE_END = '2026-12-25';

/** サンプルのPJTの名前（SPEC 7章の例と同じ） */
export const SAMPLE_PROJECT_NAME = '社内ポータル刷新';

// ---------------------------------------------------------------------------
// サンプルのデータ（画面案のとおり）
// ---------------------------------------------------------------------------

/**
 * サンプルのタスクを書くための形。
 * 工数・進捗率は、読みやすさのため人日と % で書き、作るときに整数にする。
 * 期日は画面案の日付で書き、作るときにずらす。
 * children があれば親タスク（親の工数・進捗率は子から集計するので書かない）。
 */
interface SampleTask {
  name: string;
  effort?: number;
  progress?: number;
  priority?: Priority;
  due?: DateString;
  memo?: string;
  children?: SampleTask[];
}

/** 工程ごとのサンプルのタスク。docs/test-cases.md 1章の表と同じ並び */
const SAMPLE_TASKS: Record<PhaseId, SampleTask[]> = {
  req: [
    { name: '現状ヒアリング', effort: 2, progress: 100, priority: 'high' },
    {
      name: '要件定義書作成',
      effort: 3,
      progress: 60,
      priority: 'high',
      memo: 'レビュー2回を想定',
    },
  ],
  design: [
    {
      name: '基本設計',
      children: [
        { name: '画面設計', effort: 3, progress: 0, priority: 'high' },
        { name: 'DB設計', effort: 2, progress: 0, priority: 'mid' },
      ],
    },
    { name: '詳細設計', effort: 4, progress: 0, priority: 'mid' },
  ],
  impl: [
    {
      name: 'フロント実装',
      children: [
        { name: '一覧画面', effort: 4, progress: 0, priority: 'mid' },
        { name: '詳細画面', effort: 3.5, progress: 0, priority: 'mid', due: '2026-12-18' },
      ],
    },
    { name: 'API実装', effort: 5, progress: 0, priority: 'high' },
  ],
  test: [
    { name: '結合テスト', effort: 4, progress: 0, priority: 'mid' },
    { name: '受入テスト対応', effort: 2, progress: 0, priority: 'low' },
  ],
  release: [
    {
      name: '本番リリース',
      effort: 1,
      progress: 0,
      priority: 'high',
      due: '2026-12-25',
      memo: '本番切替は夜間作業。前日にリハーサルを入れるか要相談',
    },
  ],
};

// ---------------------------------------------------------------------------
// サンプルを作る
// ---------------------------------------------------------------------------

/**
 * サンプルPJTを作る。日付は today に合わせてずらす。
 * 「今日」は引数で受け取る。テストで日付を固定できるようにするため（architecture.md 3章）。
 */
export function createSampleProject(today: DateString, makeId: IdGenerator = newId): Project {
  const start = mondayOfWeek(today);
  // 画面案の開始日から何日ずらすか。どちらも月曜なので、7の倍数になる
  // 日付の計算は calendar.ts の関数を使う（タイムゾーンでずれないよう、UTC で計算してある）
  const shift = daysBetween(BASE_START, start);
  const shiftDate = (date: DateString) => addDays(date, shift);

  const build = (sample: SampleTask): Task =>
    createTask(makeId, {
      name: sample.name,
      // 人日 → 0.1人日単位の整数（3.5 → 35）。誤差が入らないよう四捨五入する
      effortTenths: Math.round((sample.effort ?? 0) * 10),
      progressPct: sample.progress ?? 0,
      // 親タスクの優先度は画面に出さないが、型の上で必要なので mid にしておく
      priority: sample.priority ?? 'mid',
      due: sample.due ? shiftDate(sample.due) : null,
      memo: sample.memo ?? '',
      children: (sample.children ?? []).map(build),
    });

  return {
    id: makeId(),
    name: SAMPLE_PROJECT_NAME,
    start,
    end: shiftDate(BASE_END),
    overtime: false,
    phases: PHASES.map((p) => ({ id: p.id, name: p.name, tasks: SAMPLE_TASKS[p.id].map(build) })),
  };
}

/**
 * 初めて開いたときのアプリ全体のデータ。サンプルPJTを1つだけ入れ、休業日は空にする。
 * 段階3のストアで、保存データがないときに使う（architecture.md 7章）。
 */
export function createInitialAppData(today: DateString, makeId: IdGenerator = newId): AppData {
  const project = createSampleProject(today, makeId);
  return { version: CURRENT_VERSION, activeId: project.id, projects: [project], daysOff: [] };
}
