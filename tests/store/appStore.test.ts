/**
 * store/appStore.ts のテスト（tasks.md 段階3：3-1〜3-4）
 *
 * 保存先には、メモリの上の仮のもの（createMemoryBackend）を使う。
 * 同じ保存先で2つ目のストアを作ると、「再読み込み」したのと同じことになる。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { activeProject } from '../../src/core/appData';
import { SAMPLE_PROJECT_NAME } from '../../src/core/sample';
import type { Task } from '../../src/core/types';
import {
  createAppStore,
  selectCanRedo,
  selectCanUndo,
  type AppStore,
} from '../../src/store/appStore';
import { HIGHLIGHT_MS } from '../../src/store/derived';
import {
  BROKEN_STORAGE_KEY,
  createMemoryBackend,
  createPersistence,
  SAVE_DELAY_MS,
  STORAGE_KEY,
  type KeyValueBackend,
} from '../../src/store/persistence';

/** テスト用のストアを作る。今日は画面案と同じ 2026-11-19、id は順に振る */
function makeStore(backend: KeyValueBackend = createMemoryBackend()): AppStore {
  let n = 0;
  return createAppStore({
    persistence: createPersistence(backend),
    today: () => '2026-11-19',
    makeId: () => `id${++n}`,
  });
}

/** 表示中のPJTの、工程の直下の i 番目のタスク */
function taskAt(store: AppStore, phaseIndex: number, taskIndex: number): Task {
  return activeProject(store.getState().data).phases[phaseIndex]!.tasks[taskIndex]!;
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('3-1・3-2 初めて開いたとき・再読み込み', () => {
  it('初めて開いたときは、サンプルPJTが入っている', () => {
    const store = makeStore();
    const { data, computed, notice } = store.getState();
    expect(data.projects).toHaveLength(1);
    expect(activeProject(data).name).toBe(SAMPLE_PROJECT_NAME);
    // 計算結果も最初から入っている
    expect(computed.normalRows.length).toBeGreaterThan(0);
    expect(notice).toBeNull();
  });

  it('変更すると 300ms 後に保存され、再読み込みしても残る', () => {
    const backend = createMemoryBackend();
    const store = makeStore(backend);
    store.getState().actions.updateProject({ name: '再読み込みのテスト' });
    expect(backend.entries.has(STORAGE_KEY)).toBe(false);
    vi.advanceTimersByTime(SAVE_DELAY_MS);
    expect(backend.entries.has(STORAGE_KEY)).toBe(true);

    const reloaded = makeStore(backend);
    expect(reloaded.getState().data).toEqual(store.getState().data);
    expect(activeProject(reloaded.getState().data).name).toBe('再読み込みのテスト');
    // 計算結果も、読み込んだデータで作り直してある
    expect(reloaded.getState().computed.projectId).toBe(reloaded.getState().data.activeId);
  });

  it('表示の状態（開いているタスク・折りたたみ）は保存しない', () => {
    const backend = createMemoryBackend();
    const store = makeStore(backend);
    const { actions } = store.getState();
    actions.updateProject({ name: '保存させる' });
    actions.openTask(taskAt(store, 0, 0).id);
    actions.toggleCollapsed(taskAt(store, 1, 0).id);
    vi.advanceTimersByTime(SAVE_DELAY_MS);

    const reloaded = makeStore(backend).getState().view;
    expect(reloaded.openTaskId).toBeNull();
    expect(reloaded.collapsedIds.size).toBe(0);
  });

  it('保存データが壊れていたら、知らせを出してサンプルで始め、壊れたデータを残す', () => {
    const backend = createMemoryBackend({ [STORAGE_KEY]: 'これは JSON ではない' });
    const store = makeStore(backend);
    const { data, notice } = store.getState();
    expect(activeProject(data).name).toBe(SAMPLE_PROJECT_NAME);
    expect(notice?.kind).toBe('load-error');
    expect(backend.entries.get(BROKEN_STORAGE_KEY)).toBe('これは JSON ではない');

    store.getState().actions.dismissNotice();
    expect(store.getState().notice).toBeNull();
  });

  it('保存に失敗したら知らせを出す。データは画面（ストア）に残る', () => {
    const backend = createMemoryBackend();
    vi.spyOn(backend, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    const store = makeStore(backend);
    store.getState().actions.updateProject({ name: '保存できない' });
    vi.advanceTimersByTime(SAVE_DELAY_MS);
    expect(store.getState().notice?.kind).toBe('save-error');
    expect(activeProject(store.getState().data).name).toBe('保存できない');
  });
});

describe('3-3 元に戻す・やり直す', () => {
  it('工数の変更を戻し、やり直せる', () => {
    const store = makeStore();
    const { actions } = store.getState();
    const id = taskAt(store, 0, 0).id; // 現状ヒアリング（2.0人日）
    expect(selectCanUndo(store.getState())).toBe(false);

    actions.updateTask(id, { effortTenths: 50 });
    expect(taskAt(store, 0, 0).effortTenths).toBe(50);
    expect(selectCanUndo(store.getState())).toBe(true);

    actions.undo();
    expect(taskAt(store, 0, 0).effortTenths).toBe(20);
    expect(selectCanRedo(store.getState())).toBe(true);

    actions.redo();
    expect(taskAt(store, 0, 0).effortTenths).toBe(50);
  });

  it('同じ編集の回（editSession）の入力は、間が空いても1回で戻る', () => {
    const store = makeStore();
    const { actions } = store.getState();
    const id = taskAt(store, 0, 0).id;
    for (const value of [3, 35, 350]) {
      actions.updateTask(id, { effortTenths: value }, 'session-1');
      // ゆっくり打っても1件にまとまる（時間ではまとめない。architecture.md 6章、決定事項61）。
      // 偽の時計なので、2秒進めても実際には待たない
      vi.advanceTimersByTime(2000);
    }
    actions.undo();
    expect(taskAt(store, 0, 0).effortTenths).toBe(20);
    expect(selectCanUndo(store.getState())).toBe(false);
  });

  it('編集の回が違えば（欄に入り直したら）、別の1件になる', () => {
    const store = makeStore();
    const { actions } = store.getState();
    const id = taskAt(store, 0, 0).id;
    actions.updateTask(id, { effortTenths: 30 }, 'session-1');
    actions.updateTask(id, { effortTenths: 40 }, 'session-2');
    actions.undo();
    expect(taskAt(store, 0, 0).effortTenths).toBe(30);
  });

  it('PJTタブと通常／残業の切り替えは履歴に入れず、戻しても今の表示のまま', () => {
    const store = makeStore();
    const { actions } = store.getState();
    const sampleId = store.getState().data.activeId;

    const newId = actions.addProject(); // 履歴に入る
    actions.selectProject(sampleId); // 履歴に入らない
    actions.setOvertime(true); // 履歴に入らない
    expect(store.getState().history.past).toHaveLength(1);

    actions.updateProject({ name: '名前を変える' });
    actions.undo(); // 名前の変更だけが戻る
    const state = store.getState();
    expect(state.data.activeId).toBe(sampleId);
    expect(activeProject(state.data).overtime).toBe(true);
    expect(activeProject(state.data).name).toBe(SAMPLE_PROJECT_NAME);

    // PJTの追加を戻すと、足したPJTが消える。表示中のPJT（サンプル）はそのまま
    actions.undo();
    expect(store.getState().data.projects.map((p) => p.id)).toEqual([sampleId]);
    expect(newId).not.toBe(sampleId);
  });

  it('削除を戻すと、子もまとめて元に戻る', () => {
    const store = makeStore();
    const { actions } = store.getState();
    const parent = taskAt(store, 1, 0); // 基本設計（子 2件）
    actions.deleteTask(parent.id);
    expect(activeProject(store.getState().data).phases[1]!.tasks).toHaveLength(1);
    actions.undo();
    expect(taskAt(store, 1, 0)).toEqual(parent);
  });
});

describe('3-4 計算結果とハイライト', () => {
  it('工数を変えると、日程が変わった後ろのタスクを約1.5秒ハイライトする', () => {
    const store = makeStore();
    const first = taskAt(store, 0, 0); // 現状ヒアリング
    store.getState().actions.updateTask(first.id, { effortTenths: 30 }); // 2.0 → 3.0

    const highlight = store.getState().view.highlightKeys;
    // 自分は開始日が同じでも終了日が変わる。後ろのタスクもすべて1日ずれる
    expect(highlight.has(first.id)).toBe(true);
    expect(highlight.has(taskAt(store, 0, 1).id)).toBe(true);
    expect(highlight.has(taskAt(store, 4, 0).id)).toBe(true);
    // 工程の行は対象にしない
    expect(highlight.has('req')).toBe(false);

    vi.advanceTimersByTime(HIGHLIGHT_MS - 1);
    expect(store.getState().view.highlightKeys.size).toBeGreaterThan(0);
    vi.advanceTimersByTime(1);
    expect(store.getState().view.highlightKeys.size).toBe(0);
  });

  it('日程が変わらない変更（メモ）では、ハイライトしない', () => {
    const store = makeStore();
    store.getState().actions.updateTask(taskAt(store, 0, 0).id, { memo: 'メモ' });
    expect(store.getState().view.highlightKeys.size).toBe(0);
  });

  it('通常／残業の切り替えでは、日程が変わってもハイライトしない', () => {
    const store = makeStore();
    store.getState().actions.setOvertime(true);
    const { view, computed } = store.getState();
    expect(view.highlightKeys.size).toBe(0);
    expect(computed.overtime).toBe(true);
  });

  it('計算結果は通常・残業の両方を持ち、カードの値も入っている', () => {
    const { computed } = makeStore().getState();
    // test-cases.md TC-04：総工数 33.5人日、完了予定（通常）12/31
    expect(computed.cards.totalEffortTenths).toBe(335);
    expect(computed.overtimeRows).toHaveLength(computed.normalRows.length);
    expect(computed.days[0]?.date).toBe(activeProject(makeStore().getState().data).start);
  });
});

describe('詳細パネル', () => {
  it('「＋タスク追加」は、開いているタスクと同じ工程に足して、そのまま開く', () => {
    const store = makeStore();
    const { actions } = store.getState();
    actions.openTask(taskAt(store, 2, 0).id); // 実装の工程のタスクを開く
    const id = actions.addTask();
    const implTasks = activeProject(store.getState().data).phases[2]!.tasks;
    expect(implTasks[implTasks.length - 1]!.id).toBe(id);
    expect(store.getState().view.openTaskId).toBe(id);
  });

  it('開いているタスクを削除したら、パネルを閉じる', () => {
    const store = makeStore();
    const { actions } = store.getState();
    const id = taskAt(store, 0, 0).id;
    actions.openTask(id);
    actions.deleteTask(id);
    expect(store.getState().view.openTaskId).toBeNull();
  });

  it('PJTタブを切り替えたら、パネルを閉じる', () => {
    const store = makeStore();
    const { actions } = store.getState();
    const sampleId = store.getState().data.activeId;
    actions.addProject();
    actions.selectProject(sampleId);
    actions.openTask(taskAt(store, 0, 0).id);
    actions.selectProject(store.getState().data.projects[1]!.id);
    expect(store.getState().view.openTaskId).toBeNull();
  });

  it('子タスクを足すと、足した子を詳細パネルで開く（決定事項69）', () => {
    const store = makeStore();
    const { actions } = store.getState();
    const parent = taskAt(store, 1, 1); // 詳細設計（末端）
    const child = actions.addChildTask(parent.id);
    expect(child).not.toBeNull();
    expect(store.getState().view.openTaskId).toBe(child);
  });

  it('孫には子タスクを足せない', () => {
    const store = makeStore();
    const { actions } = store.getState();
    const child = taskAt(store, 1, 0).children[0]!; // 画面設計（子）
    const grandchild = actions.addChildTask(child.id);
    expect(grandchild).not.toBeNull();
    expect(actions.addChildTask(grandchild!)).toBeNull();
  });
});
