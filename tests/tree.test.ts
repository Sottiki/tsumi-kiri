/**
 * core/tree.ts のテスト（tasks.md 段階2：2-1〜2-7、TC-35・TC-39・TC-42）
 */
import { describe, expect, it } from 'vitest';
import { schedule } from '../src/core/schedule';
import {
  addChildTask,
  addTaskToPhase,
  canAddChild,
  countAllTasks,
  countDescendants,
  createProject,
  createTask,
  deleteTask,
  findTask,
  listMoveTargets,
  moveTask,
  newId,
  phaseForNewTask,
  reorderTask,
  updateTask,
  type IdGenerator,
} from '../src/core/tree';
import type { Project, Task } from '../src/core/types';

/** 'id1', 'id2', … と順に返す id の作り方。テストの結果を毎回同じにするため */
function sequentialIds(prefix = 'id'): IdGenerator {
  let n = 0;
  return () => `${prefix}${++n}`;
}

/** id と名前だけを指定してタスクを作る（ほかは初期値） */
function task(id: string, fields: Partial<Task> = {}): Task {
  return createTask(() => id, { name: id, ...fields });
}

/** 工程の直下のタスクの名前を、木の形のまま取り出す（並び順を確かめるため） */
function shape(tasks: Task[]): unknown[] {
  return tasks.map((t) => (t.children.length ? { [t.name]: shape(t.children) } : t.name));
}

/**
 * 「設計」工程に、画面案と同じ形の木を持つPJT。
 *   基本設計（親）
 *     画面設計
 *     DB設計
 *   詳細設計
 */
function designProject(): Project {
  const base = createProject('2026-11-16', () => 'p1');
  return {
    ...base,
    phases: base.phases.map((ph) =>
      ph.id === 'design'
        ? {
            ...ph,
            tasks: [
              task('基本設計', { children: [task('画面設計'), task('DB設計')] }),
              task('詳細設計'),
            ],
          }
        : ph,
    ),
  };
}

function phaseTasks(project: Project, phaseId: string): Task[] {
  return project.phases.find((p) => p.id === phaseId)!.tasks;
}

describe('2-1 新しいPJTとタスクを作る', () => {
  it('新しいPJT：名前は「新しいPJT」、開始日は今日、エンド日は空欄、5本の工程は空', () => {
    const p = createProject('2026-11-23', sequentialIds());
    expect(p).toEqual({
      id: 'id1',
      name: '新しいPJT',
      start: '2026-11-23',
      end: null,
      overtime: false,
      phases: [
        { id: 'req', name: '要件定義', tasks: [] },
        { id: 'design', name: '設計', tasks: [] },
        { id: 'impl', name: '実装', tasks: [] },
        { id: 'test', name: 'テスト', tasks: [] },
        { id: 'release', name: 'リリース', tasks: [] },
      ],
    });
  });

  it('新しいタスク：名前「新しいタスク」、工数 1.0、進捗 0%、優先度 mid', () => {
    expect(createTask(() => 'x')).toEqual({
      id: 'x',
      name: '新しいタスク',
      effortTenths: 10,
      progressPct: 0,
      priority: 'mid',
      due: null,
      memo: '',
      children: [],
    });
  });

  it('id は 10 文字の英数字で、作るたびに違う', () => {
    const ids = new Set(Array.from({ length: 1000 }, () => newId()));
    expect(ids.size).toBe(1000);
    for (const id of ids) expect(id).toMatch(/^[0-9a-z]{10}$/);
  });
});

describe('2-2 タスクの追加', () => {
  it('工程の末尾に追加する', () => {
    const p = addTaskToPhase(designProject(), 'design', task('新規'));
    expect(shape(phaseTasks(p, 'design'))).toEqual([
      { 基本設計: ['画面設計', 'DB設計'] },
      '詳細設計',
      '新規',
    ]);
  });

  it('追加先の工程：開いているタスクと同じ工程。開いていなければ最初の工程', () => {
    const p = designProject();
    expect(phaseForNewTask(p, 'DB設計')).toBe('design');
    expect(phaseForNewTask(p, null)).toBe('req');
    expect(phaseForNewTask(p, 'ない id')).toBe('req');
  });

  it('子として末尾に追加する', () => {
    const p = addChildTask(designProject(), '基本設計', task('API設計'));
    expect(shape(phaseTasks(p, 'design'))[0]).toEqual({
      基本設計: ['画面設計', 'DB設計', 'API設計'],
    });
  });

  it('孫には子を追加できない（階層が孫より深くならない）', () => {
    let p = designProject();
    p = addChildTask(p, '画面設計', task('孫'));
    expect(findTask(p, '孫')!.level).toBe(3);
    expect(canAddChild(p, '画面設計')).toBe(true);
    expect(canAddChild(p, '孫')).toBe(false);

    const after = addChildTask(p, '孫', task('ひ孫'));
    expect(after).toBe(p); // 何も変わらない
    expect(findTask(after, 'ひ孫')).toBeNull();
  });
});

describe('2-3 子を追加したときの引き継ぎ（TC-35）', () => {
  it('末端A（工数 2.0、進捗 50%）に子を追加すると、新しい子が工数・進捗を引き継ぐ', () => {
    let p = createProject('2026-11-16', () => 'p1');
    p = addTaskToPhase(p, 'req', task('A', { effortTenths: 20, progressPct: 50 }));
    p = addChildTask(p, 'A', task('A1'));

    const a = findTask(p, 'A')!.task;
    expect(a.children).toHaveLength(1);
    expect(a.children[0]).toMatchObject({ id: 'A1', effortTenths: 20, progressPct: 50 });
    // A は親になる。子の合計・平均は元の値（2.0、50%）と同じなので、日程は変わらない
    // （日程そのものは段階1Bの計算で確かめる）
  });

  it('2件目からの子は引き継がず、渡したタスクの値のまま', () => {
    let p = createProject('2026-11-16', () => 'p1');
    p = addTaskToPhase(p, 'req', task('A', { effortTenths: 20, progressPct: 50 }));
    p = addChildTask(p, 'A', task('A1'));
    p = addChildTask(p, 'A', task('A2'));
    expect(findTask(p, 'A2')!.task).toMatchObject({ effortTenths: 10, progressPct: 0 });
  });
});

describe('2-4 タスクの削除', () => {
  it('子もまとめて削除する。削除される子孫の件数を数える', () => {
    let p = designProject();
    p = addChildTask(p, '画面設計', task('孫'));
    expect(countDescendants(p, '基本設計')).toBe(3); // 画面設計・孫・DB設計
    expect(countDescendants(p, '詳細設計')).toBe(0);

    const after = deleteTask(p, '基本設計');
    expect(shape(phaseTasks(after, 'design'))).toEqual(['詳細設計']);
    expect(findTask(after, '孫')).toBeNull();
  });

  it('ない id を消そうとしても何も変わらない', () => {
    const p = designProject();
    expect(deleteTask(p, 'ない id')).toBe(p);
  });
});

describe('PJTのタスクの数（PJTの削除の確認。決定事項78）', () => {
  it('親・子・孫をすべて数え、工程は数えない', () => {
    let p = designProject(); // 基本設計（画面設計・DB設計）、詳細設計
    expect(countAllTasks(p)).toBe(4);
    p = addChildTask(p, '画面設計', task('孫'));
    expect(countAllTasks(p)).toBe(5);
  });

  it('タスクのないPJTは 0', () => {
    expect(countAllTasks(createProject('2026-11-19', sequentialIds()))).toBe(0);
  });
});

describe('子がなくなった親（TC-39）', () => {
  /** 親P（子 A：工数 2.0、進捗 50%）を「設計」工程に持つPJT。P 自身には子を足す前の値 3.0・20% が残っている */
  function parentWithOneChild(): Project {
    let p = createProject('2026-11-16', () => 'p1');
    p = addTaskToPhase(p, 'design', task('P', { effortTenths: 30, progressPct: 20 }));
    p = addChildTask(p, 'P', task('A'));
    // 子を足した後に、子の値を変える（親に残っている 3.0・20% とは違う値にする）
    return updateTask(p, 'A', { effortTenths: 20, progressPct: 50 });
  }

  /** P が工数 0・進捗 0 の末端に戻っていて、日程も工数 0 のタスクと同じ（TC-16）になっていることを確かめる */
  function expectEmptyLeaf(p: Project) {
    const parent = findTask(p, 'P')!.task;
    expect(parent.children).toEqual([]);
    expect(parent.effortTenths).toBe(0);
    expect(parent.progressPct).toBe(0);

    const row = schedule(p, [], 8).find((r) => r.key === 'P')!;
    expect(row.leaf).toBe(true);
    expect(row.start).toBe(row.end); // 長さ 0
    expect(row.startDate).toBe('2026-11-16');
    expect(row.endDate).toBe('2026-11-16');
  }

  it('(a) 最後の子を削除すると、親は工数 0・進捗 0 の末端に戻る', () => {
    expectEmptyLeaf(deleteTask(parentWithOneChild(), 'A'));
  });

  it('(b) 最後の子を別の場所へ移しても、同じように末端に戻る', () => {
    const p = moveTask(parentWithOneChild(), 'A', { phaseId: 'impl', parentId: null });
    expectEmptyLeaf(p);
    // 移したタスクの値はそのまま
    expect(findTask(p, 'A')!.task.effortTenths).toBe(20);
  });

  it('子がまだ残っていれば、親の値は変えない', () => {
    let p = parentWithOneChild();
    p = addChildTask(p, 'P', task('B'));
    const after = deleteTask(p, 'A');
    expect(findTask(after, 'P')!.task.effortTenths).toBe(30);
  });
});

describe('2-5 同じ階層の中での並べ替え（TC-42）', () => {
  it('基本設計と詳細設計を入れ替えると、子も一緒に動く', () => {
    const p = reorderTask(designProject(), '詳細設計', '基本設計');
    // ID は並び順から作るので（1-7）、この並びなら 詳細設計 2-1、基本設計 2-2、
    // 画面設計 2-2-1、DB設計 2-2-2 になる
    expect(shape(phaseTasks(p, 'design'))).toEqual([
      '詳細設計',
      { 基本設計: ['画面設計', 'DB設計'] },
    ]);

    // 日程の計算を通して、ID が並び順から振り直されることも確かめる（TC-42）
    const labels = Object.fromEntries(schedule(p, [], 8).map((row) => [row.key, row.label]));
    expect(labels['詳細設計']).toBe('2-1');
    expect(labels['基本設計']).toBe('2-2');
    expect(labels['画面設計']).toBe('2-2-1');
    expect(labels['DB設計']).toBe('2-2-2');
  });

  it('下へ動かすと、落とした先の後ろに入る', () => {
    let p = createProject('2026-11-16', () => 'p1');
    for (const id of ['A', 'B', 'C']) p = addTaskToPhase(p, 'req', task(id));
    expect(shape(phaseTasks(reorderTask(p, 'A', 'B'), 'req'))).toEqual(['B', 'A', 'C']);
    expect(shape(phaseTasks(reorderTask(p, 'A', 'C'), 'req'))).toEqual(['B', 'C', 'A']);
    expect(shape(phaseTasks(reorderTask(p, 'C', 'A'), 'req'))).toEqual(['C', 'A', 'B']);
  });

  it('別の階層・別の工程へは動かさない', () => {
    let p = designProject();
    p = addTaskToPhase(p, 'impl', task('一覧画面'));
    expect(reorderTask(p, '画面設計', '詳細設計')).toBe(p); // 子 と 親
    expect(reorderTask(p, '詳細設計', '一覧画面')).toBe(p); // 設計 と 実装
  });
});

describe('2-6 工程・親タスクの付け替え', () => {
  /**
   * 付け替えを試すためのPJT
   * 設計：基本設計（画面設計・DB設計）、詳細設計
   * 実装：フロント実装（一覧画面（一覧の部品））、API実装
   */
  function project(): Project {
    let p = designProject();
    p = addTaskToPhase(p, 'impl', task('フロント実装', { children: [task('一覧画面')] }));
    p = addTaskToPhase(p, 'impl', task('API実装'));
    p = addChildTask(p, '一覧画面', task('一覧の部品'));
    return p;
  }

  const ids = (p: Project, taskId: string) =>
    listMoveTargets(p, taskId).map((t) => `${t.phaseId}:${t.parentId ?? '-'}`);

  it('移せる先は、工程の直下と、子を持つ親タスクだけ（末端の下には移せない）', () => {
    expect(ids(project(), '詳細設計')).toEqual([
      'req:-',
      'design:-',
      'design:基本設計',
      'impl:-',
      'impl:フロント実装',
      'impl:一覧画面',
      'test:-',
      'release:-',
    ]);
  });

  it('自分と自分の子孫の下には移せない', () => {
    const targets = ids(project(), 'フロント実装');
    expect(targets).not.toContain('impl:フロント実装');
    expect(targets).not.toContain('impl:一覧画面');
  });

  it('移した後に孫より深くなる先は選べない', () => {
    // 基本設計は子を持つ（高さ 2）。子タスク（一覧画面）の下へ入れると、ひ孫ができる
    const targets = ids(project(), '基本設計');
    expect(targets).toContain('impl:フロント実装');
    expect(targets).not.toContain('impl:一覧画面');
    // フロント実装は孫まである（高さ 3）。工程の直下にしか置けない
    expect(ids(project(), 'フロント実装')).toEqual([
      'req:-',
      'design:-',
      'impl:-',
      'test:-',
      'release:-',
    ]);
  });

  it('移せる先の名前と階層', () => {
    const t = listMoveTargets(project(), '詳細設計');
    expect(t[1]).toEqual({ phaseId: 'design', parentId: null, name: '設計', level: 0 });
    expect(t[2]).toEqual({ phaseId: 'design', parentId: '基本設計', name: '基本設計', level: 1 });
  });

  it('別の親へ移すと、子も一緒に、移した先の末尾に入る', () => {
    const p = moveTask(project(), '基本設計', { phaseId: 'impl', parentId: 'フロント実装' });
    expect(shape(phaseTasks(p, 'design'))).toEqual(['詳細設計']);
    expect(shape(phaseTasks(p, 'impl'))).toEqual([
      { フロント実装: [{ 一覧画面: ['一覧の部品'] }, { 基本設計: ['画面設計', 'DB設計'] }] },
      'API実装',
    ]);
  });

  it('別の工程の直下へ移す', () => {
    const p = moveTask(project(), 'DB設計', { phaseId: 'test', parentId: null });
    expect(shape(phaseTasks(p, 'test'))).toEqual(['DB設計']);
    expect(findTask(p, 'DB設計')!.level).toBe(1);
  });

  it('移せない先・今と同じ先を指定したら、何も変わらない', () => {
    const p = project();
    expect(moveTask(p, 'フロント実装', { phaseId: 'impl', parentId: '一覧画面' })).toBe(p);
    expect(moveTask(p, '詳細設計', { phaseId: 'impl', parentId: 'API実装' })).toBe(p);
    expect(moveTask(p, '画面設計', { phaseId: 'design', parentId: '基本設計' })).toBe(p);
  });
});

describe('2-7 タスクの項目の更新', () => {
  it('名前・工数・進捗率・優先度・期日・メモを変える', () => {
    const p = updateTask(designProject(), '詳細設計', {
      name: '詳細設計書',
      effortTenths: 35,
      progressPct: 60,
      priority: 'high',
      due: '2026-12-18',
      memo: 'メモ',
    });
    expect(findTask(p, '詳細設計')!.task).toMatchObject({
      name: '詳細設計書',
      effortTenths: 35,
      progressPct: 60,
      priority: 'high',
      due: '2026-12-18',
      memo: 'メモ',
    });
  });

  it('工数は 0 以上の整数、進捗率は 0〜100 の整数に直す', () => {
    const get = (patch: Parameters<typeof updateTask>[2]) =>
      findTask(updateTask(designProject(), '詳細設計', patch), '詳細設計')!.task;
    expect(get({ effortTenths: -5 }).effortTenths).toBe(0);
    expect(get({ effortTenths: 34.6 }).effortTenths).toBe(35);
    expect(get({ progressPct: 120 }).progressPct).toBe(100);
    expect(get({ progressPct: -1 }).progressPct).toBe(0);
    expect(get({ progressPct: 33.4 }).progressPct).toBe(33);
  });

  it('期日を空欄に戻せる', () => {
    let p = updateTask(designProject(), '詳細設計', { due: '2026-12-18' });
    p = updateTask(p, '詳細設計', { due: null });
    expect(findTask(p, '詳細設計')!.task.due).toBeNull();
  });

  it('親の工数・進捗率は変えない（子から集計するため）。名前は変えられる', () => {
    const p = updateTask(designProject(), '基本設計', {
      name: '基本設計（改）',
      effortTenths: 99,
      progressPct: 99,
    });
    expect(findTask(p, '基本設計')!.task).toMatchObject({
      name: '基本設計（改）',
      effortTenths: 10,
      progressPct: 0,
    });
  });
});

describe('元のデータを書き換えない（不変更新）', () => {
  it('操作の後も元のPJTは同じ中身のまま。変わっていない工程・タスクは使い回す', () => {
    const before = designProject();
    const snapshot = structuredClone(before);
    const after = updateTask(before, 'DB設計', { effortTenths: 50 });

    expect(before).toEqual(snapshot);
    expect(after).not.toBe(before);
    // 変わっていない工程（要件定義）と兄弟（詳細設計・画面設計）は同じオブジェクト
    expect(after.phases[0]).toBe(before.phases[0]);
    expect(phaseTasks(after, 'design')[1]).toBe(phaseTasks(before, 'design')[1]);
    expect(phaseTasks(after, 'design')[0]!.children[0]).toBe(
      phaseTasks(before, 'design')[0]!.children[0],
    );
  });
});
