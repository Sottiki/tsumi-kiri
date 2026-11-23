/**
 * アプリ全体のデータ（AppData）の操作（tasks.md 段階3で、ストアから使う）
 *
 * PJTの追加・削除・並べ替え・切り替え、PJTの項目（名前・開始日・エンド日・表示モード）の変更、
 * 休業日・有給の追加と削除を行う。タスクの木の操作は tree.ts にある。
 *
 * tree.ts と同じく、どの関数も元のデータを書き換えずに新しいデータを返す（不変更新）。
 * できない操作（最後の1つのPJTの削除など）は、受け取ったデータをそのまま返す。
 * 「返ってきたデータが元と同じオブジェクトなら、何も変わっていない」と判定できる。
 *
 * React にも DOM にも依存しない（architecture.md 2章）。
 */

import { isValidDateString } from './calendar';
import type { AppData, DateString, DayOff, Project } from './types';

// ---------------------------------------------------------------------------
// PJTを1つ取り出す・置き換える
// ---------------------------------------------------------------------------

/**
 * 表示中のPJTを返す。
 * activeId は fromSaved とこのファイルの操作で必ず正しく保っているが、
 * 万一見つからないときは、先頭のPJTを返す（画面が何も出せなくなるのを避けるため）。
 */
export function activeProject(data: AppData): Project {
  const found = data.projects.find((p) => p.id === data.activeId);
  // projects は必ず1つ以上ある（最後の1つは削除できない。fromSaved でも確かめている）
  return found ?? (data.projects[0] as Project);
}

/**
 * 表示中のPJTに update をかけた、新しい AppData を返す。
 * tree.ts の関数（Project → Project）を、そのまま AppData に使えるようにするためのもの。
 * update が同じ Project を返したら（何も変わらなかったら）、元の AppData をそのまま返す。
 */
export function updateActiveProject(data: AppData, update: (project: Project) => Project): AppData {
  const current = activeProject(data);
  const next = update(current);
  if (next === current) return data;
  return {
    ...data,
    projects: data.projects.map((p) => (p.id === current.id ? next : p)),
  };
}

// ---------------------------------------------------------------------------
// PJTの追加・削除・並べ替え・切り替え（SPEC 3.1）
// ---------------------------------------------------------------------------

/** PJTを末尾に足し、そのPJTを表示する。PJTは呼ぶ側で tree.ts の createProject を使って作る */
export function addProject(data: AppData, project: Project): AppData {
  return { ...data, projects: [...data.projects, project], activeId: project.id };
}

/**
 * PJTを削除する。最後の1つは削除できない（SPEC 3.1）。
 *
 * 表示中のPJTを消したときは、すぐ右のPJTを表示する（右がなければ左）。
 * タブを閉じたときに隣のタブが選ばれる、ブラウザのタブと同じ動きにする。
 */
export function deleteProject(data: AppData, projectId: string): AppData {
  if (data.projects.length <= 1) return data;
  const index = data.projects.findIndex((p) => p.id === projectId);
  if (index === -1) return data;

  const projects = data.projects.filter((p) => p.id !== projectId);
  let activeId = data.activeId;
  if (activeId === projectId) {
    // 消した位置にいま入っているのが「右隣」。消したのが一番右なら、1つ左を選ぶ
    const neighbor = projects[Math.min(index, projects.length - 1)] as Project;
    activeId = neighbor.id;
  }
  return { ...data, projects, activeId };
}

/**
 * PJTタブを、別のタブの位置へ動かす（SPEC 3.1：ドラッグで並べ替え）。
 * 動きは tree.ts の reorderTask と同じ（取り出して、落とした先の番号へ差し込む）。
 */
export function reorderProject(data: AppData, projectId: string, overProjectId: string): AppData {
  if (projectId === overProjectId) return data;
  const from = data.projects.findIndex((p) => p.id === projectId);
  const to = data.projects.findIndex((p) => p.id === overProjectId);
  if (from === -1 || to === -1) return data;

  const projects = [...data.projects];
  const [moved] = projects.splice(from, 1);
  projects.splice(to, 0, moved as Project);
  return { ...data, projects };
}

/** 表示するPJTを切り替える。ないPJTなら何もしない */
export function setActiveProject(data: AppData, projectId: string): AppData {
  if (data.activeId === projectId) return data;
  if (!data.projects.some((p) => p.id === projectId)) return data;
  return { ...data, activeId: projectId };
}

// ---------------------------------------------------------------------------
// PJTの項目（SPEC 3.1：上部の PJT名・開始日・エンド日の欄、通常／残業の切り替え）
// ---------------------------------------------------------------------------

/** 画面から変えられるPJTの項目 */
export type ProjectPatch = Partial<Pick<Project, 'name' | 'start' | 'end'>>;

/**
 * PJTの名前・開始日・エンド日を変える。
 *
 * 日付は、ここで正しい形かを確かめてから入れる（tree.ts の updateTask と同じく、データの守りは core に置く）。
 * - 開始日：空欄にはできない（日程を積む起点なので）。正しい日付でなければ無視する
 * - エンド日：空欄（null）にできる（SPEC 3.1）。正しい日付でも null でもなければ無視する
 */
export function updateProject(project: Project, patch: ProjectPatch): Project {
  const next: Project = { ...project };
  let changed = false;

  if (patch.name !== undefined && patch.name !== project.name) {
    next.name = patch.name;
    changed = true;
  }
  if (
    patch.start !== undefined &&
    isValidDateString(patch.start) &&
    patch.start !== project.start
  ) {
    next.start = patch.start;
    changed = true;
  }
  if (
    patch.end !== undefined &&
    (patch.end === null || isValidDateString(patch.end)) &&
    patch.end !== project.end
  ) {
    next.end = patch.end;
    changed = true;
  }
  // 何も変わらなければ元のオブジェクトを返す（「変わっていない」と === で分かるように）
  return changed ? next : project;
}

/** 通常（8h）／残業（10h）の表示を切り替える */
export function setOvertime(project: Project, overtime: boolean): Project {
  if (project.overtime === overtime) return project;
  return { ...project, overtime };
}

// ---------------------------------------------------------------------------
// 休業日・有給（SPEC 5章。全PJT共通）
// ---------------------------------------------------------------------------

/**
 * 休業日・有給を足す。期間でまとめて足すときは、日付ごとに分けて渡す（段階8の 8-2）。
 *
 * - 同じ日付がすでにあれば、名前を新しいものに置き換える（同じ日が2つ並ばないように）
 * - 日付の順に並べ直す（ダイアログの一覧で見やすくするため）
 * - 正しい日付でないものは無視する
 */
export function addDaysOff(data: AppData, daysOff: readonly DayOff[]): AppData {
  const valid = daysOff.filter((d) => isValidDateString(d.date));
  if (valid.length === 0) return data;

  // 日付をキーにして入れていく。後から入れたものが勝つので、新しい名前で置き換わる
  const byDate = new Map<DateString, DayOff>();
  for (const d of data.daysOff) byDate.set(d.date, d);
  for (const d of valid) byDate.set(d.date, { date: d.date, label: d.label });

  // 'YYYY-MM-DD' は文字列のまま比べても日付の順になる
  const sorted = [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
  return { ...data, daysOff: sorted };
}

/** 休業日・有給を1日ぶん消す。その日付がなければ何もしない */
export function removeDayOff(data: AppData, date: DateString): AppData {
  if (!data.daysOff.some((d) => d.date === date)) return data;
  return { ...data, daysOff: data.daysOff.filter((d) => d.date !== date) };
}
