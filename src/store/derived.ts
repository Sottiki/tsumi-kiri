/**
 * 表示中のPJTの計算結果と、ハイライトする行（tasks.md 3-4、architecture.md 3章、SPEC 3.1）
 *
 * 計算そのものは core/schedule.ts の関数で行い、ここでは「画面が使う形にまとめる」だけをする。
 * ストアは、保存するデータが変わるたびに computeProjectView を呼んで、結果を持っておく。
 * 画面（タスク表・ガント・カード）と Excel出力は、同じ結果を読む。
 */

import { activeProject } from '../core/appData';
import { listGanttDays, schedule, summarizeCards } from '../core/schedule';
import type {
  AppData,
  DateString,
  GanttDay,
  HoursPerDay,
  ScheduleRow,
  SummaryCards,
} from '../core/types';

/** ハイライトを続ける時間（ミリ秒）。SPEC 3.1「約1.5秒」、DESIGN.md の Motion */
export const HIGHLIGHT_MS = 1500;

/** 表示中のPJTの計算結果 */
export interface ProjectView {
  /** どのPJTの結果か */
  projectId: string;
  /** 表示中のモード（残業なら true） */
  overtime: boolean;
  /** 通常 8h で計算した行。カード・警告・ガントの表示期間はこちらで決める */
  normalRows: ScheduleRow[];
  /** 残業 10h で計算した行 */
  overtimeRows: ScheduleRow[];
  /** 上部のカード4枚の値 */
  cards: SummaryCards;
  /** ガントに並べる日 */
  days: GanttDay[];
}

/**
 * 表示中のPJTの計算結果を作る。
 * 完了予定のカードと、もう一方のモードの点線（SPEC 3.1）のために、通常と残業の両方を計算する。
 *
 * @param today 今日の日付。エンド日までの営業日（カード）に使う
 */
export function computeProjectView(data: AppData, today: DateString): ProjectView {
  const project = activeProject(data);
  const normalRows = schedule(project, data.daysOff, 8);
  const overtimeRows = schedule(project, data.daysOff, 10);
  return {
    projectId: project.id,
    overtime: project.overtime,
    normalRows,
    overtimeRows,
    cards: summarizeCards(project, data.daysOff, normalRows, overtimeRows, today),
    days: listGanttDays(project, data.daysOff, normalRows),
  };
}

/** 表示中のモードの行（画面のタスク表とガントに出す行） */
export function displayedRows(view: ProjectView): ScheduleRow[] {
  return view.overtime ? view.overtimeRows : view.normalRows;
}

/** 表示中のモードの1日の稼働時間。barCells など、行の位置を日に直す関数に渡す */
export function displayedHoursPerDay(view: ProjectView): HoursPerDay {
  return view.overtime ? 10 : 8;
}

/**
 * 前の結果と比べて、日程（開始日・終了日）が変わったタスクの key を返す（SPEC 3.1）。
 * 画面では、このタスクの終了日を約1.5秒ハイライトする。
 *
 * 比べるのは「同じPJTで、同じモード」のときだけ（architecture.md 3章）。
 * PJTタブやモードを切り替えたときは、ほぼすべての行の日程が変わって見えるが、
 * それは編集で変わったのではないので、ハイライトしない。
 *
 * - 対象はタスクの行だけ（SPEC の「タスクの終了日」）。工程の行は対象にしない
 * - 新しく増えたタスク（前の結果にない行）は、比べる相手がないので対象にしない
 */
export function changedScheduleKeys(prev: ProjectView | null, next: ProjectView): string[] {
  if (prev === null || prev.projectId !== next.projectId || prev.overtime !== next.overtime) {
    return [];
  }
  const before = new Map(displayedRows(prev).map((row) => [row.key, row]));
  const changed: string[] = [];
  for (const row of displayedRows(next)) {
    if (row.kind !== 'task') continue;
    const old = before.get(row.key);
    if (!old) continue;
    if (old.startDate !== row.startDate || old.endDate !== row.endDate) {
      changed.push(row.key);
    }
  }
  return changed;
}
