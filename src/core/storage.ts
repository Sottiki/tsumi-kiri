/**
 * 保存形式の検証とバージョンの移行（tasks.md 段階2：2-9、architecture.md 4章・7章）
 *
 * メモリの形（AppData：工数・進捗率が整数）と、保存する形（SavedAppData：小数）を変換する。
 * 変換はこのファイルの fromSaved / toSaved の2つだけで行い、ほかの場所では変換しない。
 * 変換が散らばると、変換し忘れたところで小数の誤差が入り込むため（architecture.md 4章）。
 *
 * - toSaved：メモリの形 → 保存する形。localStorage とバックアップファイルに書く前に通す
 * - fromSaved：保存する形 → メモリの形。読み込んだデータは「何が入っているか分からない」ので、
 *   形を1つずつ確かめてから変換する。壊れていれば読み込まずに、理由を返す
 *
 * React にも DOM にも依存しない（architecture.md 2章）。
 */

import { isValidDateString } from './calendar';
import { MAX_LEVEL, PHASES, PRIORITIES } from './tree';
import type {
  AppData,
  DateString,
  DayOff,
  Phase,
  Priority,
  Project,
  SavedAppData,
  SavedPhase,
  SavedProject,
  SavedTask,
  Task,
} from './types';

/**
 * 今の保存形式のバージョン。
 * 保存する形を変えたら1つ上げ、下の MIGRATIONS に古い形からの変換を足す。
 */
export const CURRENT_VERSION = 1;

/** fromSaved の結果。読み込めたらデータ、読み込めなければ理由（画面にそのまま出せる日本語） */
export type LoadResult = { ok: true; data: AppData } | { ok: false; reason: string };

// ---------------------------------------------------------------------------
// メモリの形 → 保存する形
// ---------------------------------------------------------------------------

/**
 * メモリの形を、保存する形に変える。
 * - 工数：0.1人日単位の整数 → 人日の小数（35 → 3.5）
 * - 進捗率：0〜100 の整数 → 0〜1 の小数（60 → 0.6）
 *
 * 35 ÷ 10 のような割り算の結果は、JSON に書くと「3.5」になる。
 * 割り切れない値（例：1 ÷ 10 = 0.1）も、JSON では最も短い書き方「0.1」で書かれるので、
 * 読み込むときに × 10 して四捨五入すれば、必ず元の整数に戻る。
 */
export function toSaved(data: AppData): SavedAppData {
  const taskToSaved = (task: Task): SavedTask => {
    // 分割代入で、保存する形にない2つの項目を取り除く
    const { effortTenths, progressPct, children, ...rest } = task;
    return {
      ...rest,
      effort: effortTenths / 10,
      progress: progressPct / 100,
      children: children.map(taskToSaved),
    };
  };
  const phaseToSaved = (phase: Phase): SavedPhase => ({
    ...phase,
    tasks: phase.tasks.map(taskToSaved),
  });
  const projectToSaved = (project: Project): SavedProject => ({
    ...project,
    phases: project.phases.map(phaseToSaved),
  });

  return {
    ...data,
    version: CURRENT_VERSION,
    projects: data.projects.map(projectToSaved),
  };
}

// ---------------------------------------------------------------------------
// バージョンの移行
// ---------------------------------------------------------------------------

/**
 * 古い形を、1つ新しい形に変える関数の一覧。
 * キーは「変換する前のバージョン」。例：MIGRATIONS[1] は v1 → v2 の変換。
 *
 * 今はまだ v1 しかないので空。形を変えるときは、次のように足していく。
 *
 *   1: (old) => ({ ...old, version: 2, 新しい項目: 初期値 }),
 *
 * 移行は検証の前に行う。検証は「今の形」についてだけ書けばよくなるため。
 * 古いデータは何が入っているか分からないので、引数も戻り値も unknown のまま扱う。
 */
const MIGRATIONS: Record<number, (old: Record<string, unknown>) => Record<string, unknown>> = {};

/** 古いバージョンのデータを、今のバージョンまで1段ずつ移行する */
function migrate(
  raw: Record<string, unknown>,
  version: number,
): { ok: true; value: Record<string, unknown> } | { ok: false; reason: string } {
  let value = raw;
  for (let v = version; v < CURRENT_VERSION; v++) {
    const step = MIGRATIONS[v];
    if (!step) return { ok: false, reason: `バージョン ${v} からの移行に対応していません` };
    value = step(value);
  }
  return { ok: true, value };
}

// ---------------------------------------------------------------------------
// 保存する形 → メモリの形（検証しながら変換する）
// ---------------------------------------------------------------------------

/**
 * 検証に失敗したときに投げる、このファイルの中だけで使う例外。
 *
 * 検証は入れ子が深い（PJT → 工程 → タスク → 子 …）ので、
 * 失敗のたびに戻り値で理由を返すと、すべての段で「失敗なら返す」を書くことになる。
 * そこで、失敗した場所で例外を投げ、fromSaved の1か所でまとめて受け止める。
 * 外へは例外を出さず、必ず { ok: false, reason } の形で返す。
 */
class InvalidDataError extends Error {}

/**
 * 理由を作って投げる。path は、どこが壊れているかを示す文字列。
 * 例：「PJT 1 › 工程「設計」 › タスク 2：工数が正しくありません」
 */
function fail(path: string, message: string): never {
  throw new InvalidDataError(path ? `${path}：${message}` : message);
}

/** 中身のあるオブジェクトか（null と配列は除く） */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(obj: Record<string, unknown>, key: string, path: string): string {
  const value = obj[key];
  if (typeof value !== 'string') fail(path, `${key} が文字列ではありません`);
  return value;
}

function readId(obj: Record<string, unknown>, path: string, seen: Set<string>): string {
  const id = readString(obj, 'id', path);
  if (id === '') fail(path, 'id が空です');
  // id は木の中でタスクを探す目印なので、重なると別のタスクを書き換えてしまう
  if (seen.has(id)) fail(path, `id「${id}」が重なっています`);
  seen.add(id);
  return id;
}

function readDate(obj: Record<string, unknown>, key: string, path: string): DateString {
  const value = obj[key];
  if (!isValidDateString(value)) fail(path, `${key} が正しい日付（YYYY-MM-DD）ではありません`);
  return value;
}

function readDateOrNull(
  obj: Record<string, unknown>,
  key: string,
  path: string,
): DateString | null {
  if (obj[key] === null) return null;
  return readDate(obj, key, path);
}

/**
 * 保存する形のタスクを確かめて、メモリの形にする。子も同じように確かめる。
 * level は階層（親 1、子 2、孫 3）。孫より深ければ壊れているとみなす。
 */
function readTask(raw: unknown, path: string, level: number, seen: Set<string>): Task {
  if (!isRecord(raw)) fail(path, 'タスクの形が正しくありません');
  if (level > MAX_LEVEL) fail(path, '階層が孫より深くなっています');

  const id = readId(raw, path, seen);
  const name = readString(raw, 'name', path);
  const memo = readString(raw, 'memo', path);
  const due = readDateOrNull(raw, 'due', path);

  const priority = raw.priority;
  if (!PRIORITIES.includes(priority as Priority)) {
    fail(path, 'priority が high / mid / low のどれでもありません');
  }

  const effort = raw.effort;
  if (typeof effort !== 'number' || !Number.isFinite(effort) || effort < 0) {
    fail(path, 'effort（工数）が 0 以上の数ではありません');
  }
  const progress = raw.progress;
  if (typeof progress !== 'number' || !Number.isFinite(progress) || progress < 0 || progress > 1) {
    fail(path, 'progress（進捗率）が 0〜1 の数ではありません');
  }

  const children = raw.children;
  if (!Array.isArray(children)) fail(path, 'children が配列ではありません');

  return {
    id,
    name,
    // 小数を整数に変える（architecture.md 4章・5章）。
    // 例：3.5 × 10 = 35。0.1 × 3 のように誤差のある 0.30000000000000004 × 10 も、四捨五入で 3 になる
    effortTenths: Math.round(effort * 10),
    progressPct: Math.round(progress * 100),
    priority: priority as Priority,
    due,
    memo,
    children: children.map((child, i) => readTask(child, `${path} › 子 ${i + 1}`, level + 1, seen)),
  };
}

/**
 * 工程を確かめる。5本の工程が、決まった順（要件定義 → … → リリース）で並んでいること。
 * 工程の名前は保存されたものを使わず、決まった名前にする（名前は変えない決まりのため。SPEC 4章）。
 */
function readPhases(raw: unknown, path: string, seen: Set<string>): Phase[] {
  if (!Array.isArray(raw) || raw.length !== PHASES.length) {
    fail(path, `工程が ${PHASES.length} 本ではありません`);
  }
  return PHASES.map((expected, i) => {
    const phase: unknown = raw[i];
    const phasePath = `${path} › 工程「${expected.name}」`;
    if (!isRecord(phase) || phase.id !== expected.id) {
      fail(phasePath, `${i + 1} 本目の工程が「${expected.name}」ではありません`);
    }
    if (!Array.isArray(phase.tasks)) fail(phasePath, 'tasks が配列ではありません');
    return {
      id: expected.id,
      name: expected.name,
      tasks: phase.tasks.map((task, j) =>
        readTask(task, `${phasePath} › タスク ${j + 1}`, 1, seen),
      ),
    };
  });
}

function readProject(
  raw: unknown,
  path: string,
  projectIds: Set<string>,
  taskIds: Set<string>,
): Project {
  if (!isRecord(raw)) fail(path, 'PJTの形が正しくありません');
  const id = readId(raw, path, projectIds);
  const name = readString(raw, 'name', path);
  const start = readDate(raw, 'start', path);
  const end = readDateOrNull(raw, 'end', path);
  if (typeof raw.overtime !== 'boolean') fail(path, 'overtime が true / false ではありません');
  return {
    id,
    name,
    start,
    end,
    overtime: raw.overtime,
    phases: readPhases(raw.phases, path, taskIds),
  };
}

function readDayOff(raw: unknown, path: string): DayOff {
  if (!isRecord(raw)) fail(path, '休業日の形が正しくありません');
  return { date: readDate(raw, 'date', path), label: readString(raw, 'label', path) };
}

/**
 * 保存する形のデータを確かめて、メモリの形にする（architecture.md 4章）。
 *
 * 引数が unknown なのは、localStorage やバックアップファイルの中身は、
 * 手で書き換えられたり、別のアプリのデータだったりと、何が入っているか分からないため。
 * JSON.parse した後の値をそのまま渡す。
 *
 * 手順：
 * 1. バージョンを確かめる（今より新しければ読み込まない）
 * 2. 古いバージョンなら、今の形まで移行する
 * 3. 項目を1つずつ確かめながら、メモリの形（工数・進捗率は整数）に変える
 *
 * 壊れているところが見つかったら、その時点で止めて理由を返す（一部だけ読み込むことはしない）。
 * 保存されていない余分な項目は、読み飛ばす。
 */
export function fromSaved(saved: unknown): LoadResult {
  try {
    if (!isRecord(saved)) fail('', 'データの形が正しくありません');

    const version = saved.version;
    if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
      fail('', 'version が正しくありません');
    }
    if (version > CURRENT_VERSION) {
      fail('', `新しいバージョン（${version}）のアプリで保存されたデータのため、読み込めません`);
    }

    const migrated = migrate(saved, version);
    if (!migrated.ok) return migrated;
    const raw = migrated.value;

    if (!Array.isArray(raw.projects) || raw.projects.length === 0) {
      fail('', 'PJTが1つもありません');
    }
    // id の重なりを、PJTどうし・タスクどうしで確かめるための入れ物
    const projectIds = new Set<string>();
    const taskIds = new Set<string>();
    const projects = raw.projects.map((p, i) =>
      readProject(p, `PJT ${i + 1}`, projectIds, taskIds),
    );

    const activeId = raw.activeId;
    if (typeof activeId !== 'string' || !projectIds.has(activeId)) {
      fail('', '表示中のPJT（activeId）が見つかりません');
    }

    if (!Array.isArray(raw.daysOff)) fail('', 'daysOff（休業日）が配列ではありません');
    const daysOff = raw.daysOff.map((d, i) => readDayOff(d, `休業日 ${i + 1}`));

    return { ok: true, data: { version: CURRENT_VERSION, activeId, projects, daysOff } };
  } catch (error) {
    // 検証の失敗だけを理由として返す。それ以外の例外（作りの間違い）は、隠さずにそのまま投げる
    if (error instanceof InvalidDataError) return { ok: false, reason: error.message };
    throw error;
  }
}
