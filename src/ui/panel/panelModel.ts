/**
 * 詳細パネルに出す値の計算（tasks.md 6-3・6-5・6-7・6-8、SPEC 3.2）
 *
 * パネルの部品（DetailPanel.tsx）が使う、React に依存しない小さな関数を集める。
 * 画面なしに Vitest で確かめられるようにするため（tests/ui/panelModel.test.ts）。
 *
 * 日程そのものの計算は core/schedule.ts、付け替えの決まりは core/tree.ts が受け持つ。
 * ここでは、その結果を「パネルの部品が出す形」に並べ直すだけをする。
 */

import type { MoveTarget } from '../../core/tree';
import type { DateString, PhaseId, ScheduleRow } from '../../core/types';
import type { RowLayout } from '../board/rowLayout';

// ---------------------------------------------------------------------------
// 前後のタスク（6-3、決定事項64）
// ---------------------------------------------------------------------------

/** 前後のタスクの id。先頭・末尾で、その向きにタスクがなければ null */
export interface Neighbors {
  prevId: string | null;
  nextId: string | null;
}

/**
 * 前後のタスクを探す（決定事項64）。
 *
 * 一覧に表示されている順にたどる。工程の帯と、たたんで隠れている行は飛ばす。
 *
 * 開いているタスク自身が隠れていることもある（パネルを開いたあとで、その親をたたんだとき）。
 * そのときも、一覧の中での位置から、前後の見えているタスクを探す。
 *
 * @param layouts タスク表の行の並び（rowLayout.ts の layoutRows の結果）
 * @param taskId 開いているタスクの id
 */
export function findNeighbors(layouts: readonly RowLayout[], taskId: string): Neighbors {
  const index = layouts.findIndex((layout) => layout.row.key === taskId);
  if (index === -1) return { prevId: null, nextId: null };

  /** 前後へ移れる行か：タスクの行で、隠れていないもの */
  const isTarget = (layout: RowLayout) => layout.row.kind === 'task' && !layout.hidden;

  let prevId: string | null = null;
  for (let i = index - 1; i >= 0; i -= 1) {
    const layout = layouts[i] as RowLayout;
    if (isTarget(layout)) {
      prevId = layout.row.key;
      break;
    }
  }

  let nextId: string | null = null;
  for (let i = index + 1; i < layouts.length; i += 1) {
    const layout = layouts[i] as RowLayout;
    if (isTarget(layout)) {
      nextId = layout.row.key;
      break;
    }
  }

  return { prevId, nextId };
}

// ---------------------------------------------------------------------------
// 付け替えの「親タスク」の選択肢（6-8、決定事項38）
// ---------------------------------------------------------------------------

/** 親タスクの選択肢1つ */
export interface ParentOption {
  /** 親タスクの id。工程の直下なら null */
  parentId: string | null;
  /** 選択肢に出す文字（「（なし・工程の直下）」「2-1 基本設計」） */
  label: string;
}

/** 工程の直下を表す選択肢の文字（画面案③のとおり） */
export const PHASE_ROOT_LABEL = '（なし・工程の直下）';

/**
 * 「親タスク」の選択肢を作る。今いる工程の中で移せる先だけを、木の上から順に並べる。
 *
 * 移せる先の決まり（末端の下には移せない、自分の子孫の下には移せない、孫より深くならない）は
 * core/tree.ts の listMoveTargets が受け持つ。ここでは、その一覧から今の工程の分だけを取り出す。
 * 別の工程へ移すときは、先に「工程」の選択肢で工程を変える（工程の直下に入る）。
 *
 * 選択肢の文字には ID（'2-1'）を付ける。同じ名前のタスクがあっても見分けられるように。
 *
 * @param targets listMoveTargets の結果
 * @param phaseId 今いる工程
 * @param labelOf タスクの id から ID（'2-1'）を引く関数（計算結果の行から作る）
 */
export function parentOptions(
  targets: readonly MoveTarget[],
  phaseId: PhaseId,
  labelOf: (taskId: string) => string | undefined,
): ParentOption[] {
  const options: ParentOption[] = [{ parentId: null, label: PHASE_ROOT_LABEL }];
  for (const target of targets) {
    if (target.phaseId !== phaseId || target.parentId === null) continue;
    const id = labelOf(target.parentId);
    options.push({
      parentId: target.parentId,
      label: id === undefined ? target.name : `${id} ${target.name}`,
    });
  }
  return options;
}

// ---------------------------------------------------------------------------
// 工数・進捗（6-5）
// ---------------------------------------------------------------------------

/**
 * 終わった分の工数（0.1人日単位）。進捗バーの横の「1.8 / 3.0 人日」の左側。
 *
 * 工数 − 残工数 で求める。残工数は 0.1人日に四捨五入した値なので（SPEC 3.1）、
 * 終わった分も 0.1人日単位の整数になり、「終わった分 ＋ 残工数 ＝ 工数」がいつも合う。
 */
export function doneTenths(row: ScheduleRow): number {
  return row.effortTenths - row.remainingTenths;
}

// ---------------------------------------------------------------------------
// 日程の表の終了日の色（6-7、決定事項68）
// ---------------------------------------------------------------------------

/**
 * 日程の表の終了日の色の種類。
 * - over：そのモードでエンド日を超える（赤）
 * - onTime：そのモードならエンド日に間に合う（緑）
 * - none：色を付けない（エンド日が空欄、完了したタスク、日程がない）
 */
export type EndTone = 'over' | 'onTime' | 'none';

/**
 * 日程の表の終了日の色を決める（決定事項68）。
 *
 * 「超過」の判定は schedule が済ませているので（エンド日が空欄なら超過にならない、完了なら超過にならない）、
 * 行の status をそのまま使う。超過でないときに緑にするのは、エンド日があって、まだ完了していないときだけ。
 * 完了したタスクは、エンド日に間に合ったかどうかを示す意味がないので、色を付けない。
 *
 * @param row そのモード（通常 8h か残業 10h）で計算した、そのタスクの行
 * @param projectEnd PJTのエンド日。空欄なら null
 */
export function endTone(row: ScheduleRow, projectEnd: DateString | null): EndTone {
  if (row.status === '超過') return 'over';
  if (projectEnd === null || row.endDate === null || row.status === '完了') return 'none';
  return 'onTime';
}
