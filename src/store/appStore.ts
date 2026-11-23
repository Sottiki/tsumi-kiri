/**
 * アプリのストア（tasks.md 3-1〜3-4、architecture.md 3章・6章・7章）
 *
 * Zustand で、アプリの状態を1か所にまとめて持つ。画面（ui）と Excel出力は、ここから読み書きする。
 *
 * ■ 持つもの
 * - data：保存するデータ（AppData）。persist で localStorage に保存する
 * - view：表示の状態（開いているタスク、折りたたみ、ハイライト）。保存しない（SPEC 3.1）
 * - computed：表示中のPJTの計算結果（通常・残業）。data が変わるたびに作り直す
 * - history：元に戻す・やり直すの履歴
 * - notice：画面に出す知らせ（保存の失敗、壊れたデータ）
 * - actions：操作の関数
 *
 * ■ データの変え方
 * data は必ず actions の関数を通して変える。actions の中では、core の関数（tree.ts・appData.ts）で
 * 新しいデータを作り、change（履歴に残す）か switchView（履歴に残さない）に渡す。
 * どちらも最後は commit に行き着き、そこで計算結果・ハイライト・表示の状態をまとめて更新する。
 *
 * ストアは createAppStore で作る。テストでは、保存先にメモリの上の仮のものを渡して作る。
 * 画面で使う1つだけのストアは store/index.ts で作る。
 */

import { persist } from 'zustand/middleware';
import { createStore, type StoreApi } from 'zustand/vanilla';
import * as appOps from '../core/appData';
import { activeProject, type ProjectPatch } from '../core/appData';
import { createInitialAppData } from '../core/sample';
import * as treeOps from '../core/tree';
import { canAddChild, createProject, createTask, findTask, newId } from '../core/tree';
import type { IdGenerator, TaskPatch } from '../core/tree';
import type { AppData, DateString, DayOff, PhaseId } from '../core/types';
import { changedScheduleKeys, computeProjectView, HIGHLIGHT_MS, type ProjectView } from './derived';
import { emptyHistory, recordChange, redo, undo, type History } from './history';
import { STORAGE_KEY, type AppPersistence, type PersistedState } from './persistence';

// ---------------------------------------------------------------------------
// 型
// ---------------------------------------------------------------------------

/** 画面に出す知らせ */
export interface Notice {
  /** save-error：保存に失敗した。load-error：保存データを読み込めなかった */
  kind: 'save-error' | 'load-error';
  message: string;
}

/** 表示の状態。保存も、元に戻すもしない（architecture.md 6章） */
export interface ViewState {
  /** 詳細パネルで開いているタスクの id。閉じていれば null */
  openTaskId: string | null;
  /**
   * 折りたたんでいる親タスクの id。
   * 開き直すとすべて広げた状態に戻る（SPEC 3.1）ので、空から始めて保存しない
   */
  collapsedIds: ReadonlySet<string>;
  /** 日程が変わって、終了日をハイライトしているタスクの id（SPEC 3.1：約1.5秒） */
  highlightKeys: ReadonlySet<string>;
}

/** 操作の関数。タスクの操作は、表示中のPJTに対して行う */
export interface AppActions {
  // --- PJT（SPEC 3.1） ---
  /** 新しいPJTを末尾に足して表示する。足したPJTの id を返す */
  addProject(): string;
  deleteProject(projectId: string): void;
  reorderProject(projectId: string, overProjectId: string): void;
  /** PJTタブの切り替え。元に戻す対象にしない */
  selectProject(projectId: string): void;
  /** 表示中のPJTの名前・開始日・エンド日を変える */
  /**
   * 表示中のPJTの名前・開始日・エンド日を変える。
   * @param editSession 入力欄の編集の回の目印。同じ目印の変更は、元に戻すの履歴で1件にまとめる
   */
  updateProject(patch: ProjectPatch, editSession?: string): void;
  /** 通常／残業の切り替え。元に戻す対象にしない */
  setOvertime(overtime: boolean): void;

  // --- タスク（SPEC 3.1・3.2） ---
  /**
   * 「＋タスク追加」：開いているタスクと同じ工程の末尾（開いていなければ最初の工程）に足し、
   * そのまま詳細パネルで開く。足したタスクの id を返す
   */
  addTask(): string;
  /** 工程の帯からの追加：その工程の末尾に足し、詳細パネルで開く。足したタスクの id を返す */
  addTaskToPhase(phaseId: PhaseId): string;
  /** 子タスクを足す。足せない（孫の下など）ときは null。足したタスクの id を返す */
  addChildTask(parentId: string): string | null;
  deleteTask(taskId: string): void;
  reorderTask(taskId: string, overTaskId: string): void;
  moveTask(taskId: string, target: { phaseId: PhaseId; parentId: string | null }): void;
  /**
   * タスクの項目を変える。
   * @param editSession 入力欄の編集の回の目印。同じ目印の変更は、元に戻すの履歴で1件にまとめる
   */
  updateTask(taskId: string, patch: TaskPatch, editSession?: string): void;

  // --- 休業日・有給（SPEC 5章） ---
  addDaysOff(daysOff: readonly DayOff[]): void;
  removeDayOff(date: DateString): void;

  // --- 元に戻す・やり直す（SPEC 3.1） ---
  undo(): void;
  redo(): void;

  // --- 表示の状態 ---
  /** 詳細パネルを開く（null で閉じる） */
  openTask(taskId: string | null): void;
  /** 親タスクの開閉を切り替える */
  toggleCollapsed(taskId: string): void;
  /** 知らせを閉じる */
  dismissNotice(): void;
}

export interface AppState {
  data: AppData;
  view: ViewState;
  computed: ProjectView;
  history: History;
  notice: Notice | null;
  actions: AppActions;
}

export type AppStore = StoreApi<AppState>;

export interface AppStoreOptions {
  /** 保存先（store/persistence.ts の createPersistence で作る） */
  persistence: AppPersistence;
  /** 今日の日付を返す関数。テストで日付を固定できるよう、差し替えられる */
  today?: () => DateString;
  /** id の作り方。テストで id を決まった値にするため */
  makeId?: IdGenerator;
}

// ---------------------------------------------------------------------------
// 小さな関数
// ---------------------------------------------------------------------------

/**
 * 今日の日付（'YYYY-MM-DD'）。使っている人のPCの「その土地の日付」で出す。
 *
 * calendar.ts は日付の計算を UTC で行うが、「今日が何日か」は、
 * 使っている人がいる場所の日付でなければならない（日本の朝 8 時は、UTC ではまだ前の日）。
 * そのため、ここだけはローカル時刻の関数（getFullYear など）を使う。
 */
export function localToday(now: Date = new Date()): DateString {
  const year = String(now.getFullYear());
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * 入力欄の「編集の回の目印」から、履歴をまとめるための目印を作る（store/history.ts の recordChange）。
 * 目印がない変更（ボタンでの変更など）は、まとめない（null）。
 *
 * 欄に入ってから離れるまでの入力を1件にまとめる（SPEC 3.1、決定事項61）。
 * 目印は欄にカーソルが入るたびに新しくなるので、同じ欄でも、入り直したら別の1件になる。
 */
function mergeKeyOf(editSession: string | undefined): string | null {
  return editSession === undefined ? null : `edit:${editSession}`;
}

// ---------------------------------------------------------------------------
// ストアを作る
// ---------------------------------------------------------------------------

export function createAppStore(options: AppStoreOptions): AppStore {
  const { persistence } = options;
  const today = options.today ?? (() => localToday());
  const makeId = options.makeId ?? newId;

  /** ハイライトを消すタイマー。新しくハイライトしたら、前のタイマーは止める */
  let highlightTimer: ReturnType<typeof setTimeout> | null = null;

  const initialData = createInitialAppData(today(), makeId);

  const store = createStore<AppState>()(
    persist(
      (set, get) => {
        /**
         * 新しいデータを入れ、それに合わせて計算結果・ハイライト・表示の状態を更新する。
         * データを変えるときは、必ずここを通る。
         */
        const commit = (next: AppData, history: History) => {
          const state = get();
          const computed = computeProjectView(next, today());
          const changed = changedScheduleKeys(state.computed, computed);

          // --- ハイライト（SPEC 3.1、tasks.md 3-4） ---
          let highlightKeys = state.view.highlightKeys;
          const switched =
            computed.projectId !== state.computed.projectId ||
            computed.overtime !== state.computed.overtime;
          if (changed.length > 0) {
            // 今回日程が変わったタスクだけをハイライトし、1.5秒後に消す
            highlightKeys = new Set(changed);
            if (highlightTimer !== null) clearTimeout(highlightTimer);
            highlightTimer = setTimeout(() => {
              highlightTimer = null;
              set((s) => ({ view: { ...s.view, highlightKeys: new Set() } }));
            }, HIGHLIGHT_MS);
          } else if (switched && highlightKeys.size > 0) {
            // PJTやモードを切り替えたら、前のハイライトは意味がなくなるので消す
            highlightKeys = new Set();
          }

          // --- 詳細パネル ---
          // 開いているタスクが、表示中のPJTにもうない（削除した・別のPJTへ切り替えた）なら閉じる
          let openTaskId = state.view.openTaskId;
          if (openTaskId !== null && !findTask(activeProject(next), openTaskId)) {
            openTaskId = null;
          }

          set({
            data: next,
            history,
            computed,
            view: { ...state.view, openTaskId, highlightKeys },
          });
        };

        /**
         * 履歴に残す変更。update が同じデータを返したら（何も変わらなかったら）、何もしない。
         * @param mergeKey 1件にまとめるための目印（history.ts）
         */
        const change = (update: (data: AppData) => AppData, mergeKey: string | null = null) => {
          const { data, history } = get();
          const next = update(data);
          if (next === data) return;
          commit(next, recordChange(history, data, mergeKey));
        };

        /** 履歴に残さない変更（PJTタブと、通常／残業の切り替え。SPEC 3.1） */
        const switchView = (update: (data: AppData) => AppData) => {
          const { data, history } = get();
          const next = update(data);
          if (next === data) return;
          commit(next, history);
        };

        /** 表示中のPJTに、tree.ts の操作をかける（履歴に残す） */
        const changeActive = (
          update: Parameters<typeof appOps.updateActiveProject>[1],
          mergeKey: string | null = null,
        ) => change((data) => appOps.updateActiveProject(data, update), mergeKey);

        /** タスクを工程の末尾に足し、詳細パネルで開く */
        const addTaskAndOpen = (phaseId: PhaseId): string => {
          const task = createTask(makeId);
          changeActive((project) => treeOps.addTaskToPhase(project, phaseId, task));
          set((s) => ({ view: { ...s.view, openTaskId: task.id } }));
          return task.id;
        };

        const actions: AppActions = {
          addProject: () => {
            const project = createProject(today(), makeId);
            change((data) => appOps.addProject(data, project));
            return project.id;
          },
          deleteProject: (projectId) => change((data) => appOps.deleteProject(data, projectId)),
          reorderProject: (projectId, overProjectId) =>
            change((data) => appOps.reorderProject(data, projectId, overProjectId)),
          selectProject: (projectId) =>
            switchView((data) => appOps.setActiveProject(data, projectId)),
          updateProject: (patch, editSession) =>
            changeActive(
              (project) => appOps.updateProject(project, patch),
              mergeKeyOf(editSession),
            ),
          setOvertime: (overtime) =>
            switchView((data) =>
              appOps.updateActiveProject(data, (project) => appOps.setOvertime(project, overtime)),
            ),

          addTask: () => {
            const phaseId = treeOps.phaseForNewTask(
              activeProject(get().data),
              get().view.openTaskId,
            );
            return addTaskAndOpen(phaseId);
          },
          addTaskToPhase: (phaseId) => addTaskAndOpen(phaseId),
          addChildTask: (parentId) => {
            if (!canAddChild(activeProject(get().data), parentId)) return null;
            const task = createTask(makeId);
            changeActive((project) => treeOps.addChildTask(project, parentId, task));
            return task.id;
          },
          deleteTask: (taskId) => changeActive((project) => treeOps.deleteTask(project, taskId)),
          reorderTask: (taskId, overTaskId) =>
            changeActive((project) => treeOps.reorderTask(project, taskId, overTaskId)),
          moveTask: (taskId, target) =>
            changeActive((project) => treeOps.moveTask(project, taskId, target)),
          updateTask: (taskId, patch, editSession) =>
            changeActive(
              (project) => treeOps.updateTask(project, taskId, patch),
              mergeKeyOf(editSession),
            ),

          addDaysOff: (daysOff) => change((data) => appOps.addDaysOff(data, daysOff)),
          removeDayOff: (date) => change((data) => appOps.removeDayOff(data, date)),

          undo: () => {
            const step = undo(get().history, get().data);
            if (step) commit(step.data, step.history);
          },
          redo: () => {
            const step = redo(get().history, get().data);
            if (step) commit(step.data, step.history);
          },

          openTask: (taskId) => {
            // 表示中のPJTにないタスクは開かない
            if (taskId !== null && !findTask(activeProject(get().data), taskId)) return;
            set((s) => ({ view: { ...s.view, openTaskId: taskId } }));
          },
          toggleCollapsed: (taskId) =>
            set((s) => {
              const collapsedIds = new Set(s.view.collapsedIds);
              if (collapsedIds.has(taskId)) collapsedIds.delete(taskId);
              else collapsedIds.add(taskId);
              return { view: { ...s.view, collapsedIds } };
            }),
          dismissNotice: () => set({ notice: null }),
        };

        return {
          data: initialData,
          view: { openTaskId: null, collapsedIds: new Set(), highlightKeys: new Set() },
          computed: computeProjectView(initialData, today()),
          history: emptyHistory(),
          notice: null,
          actions,
        };
      },
      {
        name: STORAGE_KEY,
        storage: persistence,
        // 保存するのはデータだけ。表示の状態・計算結果・履歴は保存しない
        partialize: (state): PersistedState => ({ data: state.data }),
        // 保存データを読み込めたら、データを入れ替え、計算結果も作り直す。
        // 読み込むものがなかった（初めて開いた・壊れていた）ときは、初期値（サンプルPJT）のまま
        merge: (persisted, current) => {
          const saved = persisted as PersistedState | undefined;
          if (!saved) return current;
          return {
            ...current,
            data: saved.data,
            computed: computeProjectView(saved.data, today()),
          };
        },
      },
    ),
  );

  // 保存先は localStorage を同期で読むので、ここまででもう読み込みは終わっている。
  // 読み込みで問題があれば、ここで知らせにする（ストアを作る途中では知らせられないため）
  const loadProblem = persistence.takeLoadProblem();
  if (loadProblem !== null) {
    store.setState({ notice: { kind: 'load-error', message: loadProblem } });
  }
  persistence.onSaveError((message) => {
    store.setState({ notice: { kind: 'save-error', message } });
  });

  return store;
}

// ---------------------------------------------------------------------------
// よく使う読み出し（画面の useAppStore(selector) に渡す）
// ---------------------------------------------------------------------------

/** 表示中のPJT */
export const selectActiveProject = (state: AppState) => activeProject(state.data);
/** 元に戻せるか（ボタンの有効・無効などに使う） */
export const selectCanUndo = (state: AppState) => state.history.past.length > 0;
/** やり直せるか */
export const selectCanRedo = (state: AppState) => state.history.future.length > 0;
