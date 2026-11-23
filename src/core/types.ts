/**
 * データの型（architecture.md 4章）
 *
 * このファイルには型だけを置き、処理は書かない。
 * core（計算とデータ操作）・store・ui・excel のすべてが、ここの型を使う。
 *
 * ■ 2種類の形を持つ
 * - メモリの形（AppData など）：アプリが動いている間に使う形。
 *   工数と進捗率を「整数」で持ち、計算で小数の誤差が出ないようにする（architecture.md 5章）。
 * - 保存する形（SavedAppData など）：localStorage とバックアップファイルに書く形。
 *   人が読んで分かりやすいよう、SPEC 7章のとおり小数（effort: 3.5、progress: 0.6）で持つ。
 *
 * 2つの形の変換は core/storage.ts の fromSaved / toSaved だけで行う（段階2の 2-9 で作る）。
 * ほかの場所では変換しない。変換があちこちに散らばると、変換し忘れたところで誤差が出るため。
 */

// ---------------------------------------------------------------------------
// 共通の小さな型
// ---------------------------------------------------------------------------

/**
 * 日付。'YYYY-MM-DD' 形式の文字列（例：'2026-11-23'）。
 *
 * Date オブジェクトで持たないのは、タイムゾーンによって日付が1日ずれるのを避けるため。
 * 計算で Date が必要なときは、その場で作って使い捨てにする。
 *
 * 中身はただの string なので、型の上では書式の間違いを防げない。
 * 「日付が入る」ことを読む人に伝えるための別名。
 */
export type DateString = string;

/** 優先度。高・中・低の3段階（SPEC 3.2） */
export type Priority = 'high' | 'mid' | 'low';

/**
 * 工程の id。5本で固定（SPEC 4章）。
 * 並び順もこの順で固定：要件定義 → 設計 → 実装 → テスト → リリース。
 */
export type PhaseId = 'req' | 'design' | 'impl' | 'test' | 'release';

/** タスクの状態（SPEC 4章）。判定は 1-6 で作る */
export type Status = '完了' | '進行中' | '未着手' | '超過';

// ---------------------------------------------------------------------------
// メモリの形（アプリが動いている間に使う）
// ---------------------------------------------------------------------------

/**
 * タスク。子を持てば「親」、持たなければ「末端」になる。
 * 階層は 親 → 子 → 孫 の3段まで（孫より深くはしない。段階2で守る）。
 */
export interface Task {
  /** 自前の短いランダム文字列。画面の ID（'1-2-1'）とは別物で、並び替えても変わらない */
  id: string;
  name: string;
  /**
   * 工数。0.1人日単位の整数（3.5人日 → 35）。
   * 末端だけが使う。親の工数は子の合計を計算で求めるので、親のこの値は使わない。
   * 子を追加したときに最初の子へ引き継ぐ（2-3）ため、親でも値は残しておく。
   */
  effortTenths: number;
  /**
   * 進捗率。0〜100 の整数（1%刻み。60% → 60）。
   * effortTenths と同じく、末端だけが使う。
   */
  progressPct: number;
  priority: Priority;
  /** 期日。空欄なら null */
  due: DateString | null;
  memo: string;
  /** 子タスク。末端なら空の配列 */
  children: Task[];
}

/** 工程。5本で固定で、追加・削除はしない */
export interface Phase {
  id: PhaseId;
  name: string;
  tasks: Task[];
}

/** PJT（プロジェクト）。日程はPJTごとに別々に計算する */
export interface Project {
  id: string;
  name: string;
  /** 開始日。ここから稼働日を数えて、タスクを積んでいく */
  start: DateString;
  /** エンド日（締め切り）。まだ決まっていなければ null（SPEC 3.1） */
  end: DateString | null;
  /** 残業モードで表示しているか。true なら1日10時間、false なら8時間 */
  overtime: boolean;
  /** 5本の工程。並び順は PhaseId の順 */
  phases: Phase[];
}

/** 休業日・有給。全PJTで共通（SPEC 5章）。日本の祝日はここに入れず、同梱のデータから求める */
export interface DayOff {
  date: DateString;
  /** 表示用の名前（例：'年末休業'） */
  label: string;
}

/** アプリ全体のデータ。ストアが持ち、保存するときは toSaved で SavedAppData に変える */
export interface AppData {
  /** 保存する形のバージョン。形を変えたら上げ、storage.ts で古い形から移行する */
  version: number;
  /** 表示中のPJTの id */
  activeId: string;
  projects: Project[];
  daysOff: DayOff[];
}

// ---------------------------------------------------------------------------
// 保存する形（localStorage・バックアップファイル）
// ---------------------------------------------------------------------------
//
// 工数・進捗率の2つの項目だけが、メモリの形と違う。
// それ以外の項目は同じなので、Omit でメモリの形から取り除き、保存用の項目を足して作る。
// こうしておくと、メモリの形に項目を足したとき、保存する形にも自動で入る。

/** 保存する形のタスク */
export interface SavedTask extends Omit<Task, 'effortTenths' | 'progressPct' | 'children'> {
  /** 工数。人日の小数（3.5） */
  effort: number;
  /** 進捗率。0〜1 の小数（0.6） */
  progress: number;
  children: SavedTask[];
}

/** 保存する形の工程 */
export interface SavedPhase extends Omit<Phase, 'tasks'> {
  tasks: SavedTask[];
}

/** 保存する形のPJT */
export interface SavedProject extends Omit<Project, 'phases'> {
  phases: SavedPhase[];
}

/** 保存する形のアプリ全体のデータ。localStorage とバックアップファイルの中身 */
export interface SavedAppData extends Omit<AppData, 'projects'> {
  projects: SavedProject[];
}

// ---------------------------------------------------------------------------
// 計算結果（保存しない。データが変わるたびに作り直す）
// ---------------------------------------------------------------------------

/**
 * 計算結果の1行。タスク表とガントの1行に当たる。
 * 工程の行とタスクの行が、画面に出る順に並ぶ。
 */
export interface ScheduleRow {
  /** タスクまたは工程の id */
  key: string;
  kind: 'phase' | 'task';
  /** 画面に出す ID（'1-2-1'）。並び順から毎回作る（1-7） */
  label: string;
  /** 階層。工程 0、親 1、子 2、孫 3 */
  level: number;
  /** 末端か（子を持たないタスク）。工程の行は false */
  leaf: boolean;
  /**
   * 開始位置。PJTの開始日から数えた時間で、0.1時間単位の整数（architecture.md 5章）。
   * 1日の長さは、通常 80、残業 100。
   * タスクのない工程・親は日程がないので null。
   */
  start: number | null;
  /** 終了位置。start と同じ単位 */
  end: number | null;
  /** 開始日。日程がなければ null */
  startDate: DateString | null;
  /** 終了日。日程がなければ null */
  endDate: DateString | null;
  /** 工数。0.1人日単位の整数。親・工程は子の合計 */
  effortTenths: number;
  /**
   * 進捗率（0〜100）。
   * 末端は整数。親・工程は直下の子の単純平均なので、小数のまま持つ。
   * 日付の計算には使わないので、小数の誤差があっても日付はずれない。
   * 画面に出すときに整数%へ丸める（architecture.md 5章）。
   */
  progressPct: number;
  /**
   * 残工数。0.1人日単位の整数。
   * 末端は 工数 ×（100 − 進捗率）を 0.1人日に四捨五入した値。親・工程は、その合計。
   */
  remainingTenths: number;
  status: Status;
  /** 期日超過か（終了日がそのタスクの期日より後。完了したタスクには付けない。SPEC 5章） */
  overDue: boolean;
}
