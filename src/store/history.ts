/**
 * 元に戻す・やり直すの履歴（tasks.md 3-3、architecture.md 6章、SPEC 3.1）
 *
 * React にも Zustand にも依存しない、ただの関数だけを置く。ストア（appStore.ts）から使う。
 * 単体でテストできるよう、「今の時刻」も引数で受け取る。
 *
 * ■ しくみ
 * 変更のたびに「変更する前の AppData」を past に積む。
 * - 元に戻す：past の最後の版を取り出して今のデータにし、今のデータは future に積む
 * - やり直す：その逆
 * - 新しい変更をしたら、future は捨てる（やり直せるのは、戻した直後だけ）
 *
 * 変更は不変更新で行うので（tree.ts・appData.ts）、版どうしで変わっていない工程やタスクは
 * 同じオブジェクトを共有している。そのため 100 件積んでも、メモリはあまり増えない。
 */

import type { AppData } from '../core/types';

/** 履歴に残す最大の件数（tasks.md 3-3） */
export const HISTORY_LIMIT = 100;

/**
 * 同じ欄への続けての入力を1件にまとめる時間（ミリ秒。tasks.md 3-3）。
 * 前の入力からこの時間以内に、同じ欄へまた入力したら、新しい履歴を積まない。
 * 工数を「3」「3.」「3.5」と打ったときに、1文字ずつ戻らないようにするため。
 */
export const MERGE_WINDOW_MS = 1000;

export interface History {
  /** 戻せる版。古い順に並び、最後が一番新しい */
  readonly past: readonly AppData[];
  /** やり直せる版。最後が、次にやり直す版 */
  readonly future: readonly AppData[];
  /** 前の変更の「まとめるための目印」（例：'task:abc:effortTenths'）。まとめない変更なら null */
  readonly lastMergeKey: string | null;
  /** 前の変更の時刻（ミリ秒） */
  readonly lastChangedAt: number;
}

/** 空の履歴 */
export function emptyHistory(): History {
  return { past: [], future: [], lastMergeKey: null, lastChangedAt: 0 };
}

/**
 * 変更を履歴に記録する。
 *
 * @param before 変更する前のデータ（これを past に積む）
 * @param mergeKey 同じ欄への入力をまとめるための目印。まとめない変更（削除・追加など）は null
 * @param now 今の時刻（ミリ秒）
 *
 * まとめるのは、次の3つがそろったとき：
 * - mergeKey が null ではない
 * - 前の変更と mergeKey が同じ（同じタスクの同じ欄）
 * - 前の変更から MERGE_WINDOW_MS 以内
 * まとめるときは past に積まない。past の最後には「入力を始める前の版」が残っているので、
 * 元に戻すと、続けて打った入力がまとめて戻る。
 *
 * 続けて打っている間は前の変更の時刻が更新されていくので、
 * 1秒より短い間隔で打ち続けるかぎり、全体で1秒を超えても1件にまとまる。
 */
export function recordChange(
  history: History,
  before: AppData,
  mergeKey: string | null,
  now: number,
): History {
  const canMerge =
    mergeKey !== null &&
    mergeKey === history.lastMergeKey &&
    now - history.lastChangedAt <= MERGE_WINDOW_MS;

  if (canMerge) {
    return { ...history, future: [], lastChangedAt: now };
  }

  // 上限を超えたら、一番古い版から捨てる
  const past = [...history.past, before];
  if (past.length > HISTORY_LIMIT) past.splice(0, past.length - HISTORY_LIMIT);
  return { past, future: [], lastMergeKey: mergeKey, lastChangedAt: now };
}

/** 元に戻した・やり直した結果 */
export interface HistoryStep {
  history: History;
  /** 新しく今のデータになる版（表示の状態は keepViewState で今のものに合わせてある） */
  data: AppData;
}

/** 元に戻す。戻せる版がなければ null */
export function undo(history: History, current: AppData): HistoryStep | null {
  const target = history.past[history.past.length - 1];
  if (!target) return null;
  return {
    history: {
      past: history.past.slice(0, -1),
      future: [...history.future, current],
      // 戻した直後の入力は、戻す前の入力とまとめない
      lastMergeKey: null,
      lastChangedAt: 0,
    },
    data: keepViewState(target, current),
  };
}

/** やり直す。やり直せる版がなければ null */
export function redo(history: History, current: AppData): HistoryStep | null {
  const target = history.future[history.future.length - 1];
  if (!target) return null;
  return {
    history: {
      past: [...history.past, current],
      future: history.future.slice(0, -1),
      lastMergeKey: null,
      lastChangedAt: 0,
    },
    data: keepViewState(target, current),
  };
}

/**
 * 戻す先の版に、今の「表示の切り替え」を引き継ぐ（SPEC 3.1、architecture.md 6章）。
 *
 * PJTタブの切り替え（activeId）と、通常／残業の切り替え（Project.overtime）は AppData の中にあるが、
 * 表示の切り替えなので元に戻す対象にしない。
 * 版をそのまま入れ替えると、戻したときにタブやモードまで昔の状態に戻ってしまうので、
 * 今の値で上書きする。
 *
 * - 表示中のPJTが戻す先の版にもあれば、そのまま表示する
 * - なければ（PJTの追加を戻したときなど）、先頭のPJTを表示する
 * - 今もあるPJTは、今の表示モードにそろえる。今はないPJT（削除を戻したとき）は、版の値のまま
 */
export function keepViewState(target: AppData, current: AppData): AppData {
  const overtimeById = new Map(current.projects.map((p) => [p.id, p.overtime]));

  const projects = target.projects.map((project) => {
    const overtime = overtimeById.get(project.id);
    if (overtime === undefined || overtime === project.overtime) return project;
    return { ...project, overtime };
  });

  const activeStillExists = projects.some((p) => p.id === current.activeId);
  // projects は必ず1つ以上ある（最後の1つは削除できない）
  const activeId = activeStillExists ? current.activeId : (projects[0]?.id ?? target.activeId);

  return { ...target, projects, activeId };
}
