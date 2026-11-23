/**
 * 元に戻す・やり直すの履歴（tasks.md 3-3、architecture.md 6章、SPEC 3.1）
 *
 * React にも Zustand にも依存しない、ただの関数だけを置く。ストア（appStore.ts）から使う。
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

export interface History {
  /** 戻せる版。古い順に並び、最後が一番新しい */
  readonly past: readonly AppData[];
  /** やり直せる版。最後が、次にやり直す版 */
  readonly future: readonly AppData[];
  /** 前の変更の「まとめるための目印」（例：'edit:3'）。まとめない変更なら null */
  readonly lastMergeKey: string | null;
}

/** 空の履歴 */
export function emptyHistory(): History {
  return { past: [], future: [], lastMergeKey: null };
}

/**
 * 変更を履歴に記録する。
 *
 * @param before 変更する前のデータ（これを past に積む）
 * @param mergeKey 1件にまとめるための目印。まとめない変更（削除・追加など）は null
 *
 * ■ まとめ方（SPEC 3.1、決定事項61：Excel やスプレッドシートにそろえる）
 * 1つの欄に入ってから離れるまでの入力（編集の1回）を、1件にまとめる。
 * 工数を「3」「3.」「3.5」と打ったときに、1文字ずつ戻らないようにするため。
 * 画面の入力欄は、カーソルが入るたびに新しい目印を作って渡してくる（ui/DraftInput.tsx）。
 *
 * まとめるのは、mergeKey が null ではなく、前の変更と同じとき。時間は見ない（ゆっくり打っても1件）。
 * 間にほかの変更（タスクの追加など。目印は null）が入れば、前の目印は消えるので、そこで区切れる。
 * まとめるときは past に積まない。past の最後には「入力を始める前の版」が残っているので、
 * 元に戻すと、その欄の入力がまとめて戻る。
 */
export function recordChange(history: History, before: AppData, mergeKey: string | null): History {
  const canMerge = mergeKey !== null && mergeKey === history.lastMergeKey;

  if (canMerge) {
    // やり直せる版は、新しい入力をしたので捨てる
    return { ...history, future: [] };
  }

  // 上限を超えたら、一番古い版から捨てる
  const past = [...history.past, before];
  if (past.length > HISTORY_LIMIT) past.splice(0, past.length - HISTORY_LIMIT);
  return { past, future: [], lastMergeKey: mergeKey };
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
      // 戻した直後の入力は、戻す前の入力とまとめない。
      // 同じ欄で打ち続けても、戻した後の入力は新しい1件になる（でないと、戻せなくなる）
      lastMergeKey: null,
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
