/**
 * core/storage.ts のテスト（tasks.md 段階2：2-9）
 */
import { describe, expect, it } from 'vitest';
import { createInitialAppData } from '../src/core/sample';
import { CURRENT_VERSION, fromSaved, toSaved } from '../src/core/storage';
import type { SavedAppData, SavedTask } from '../src/core/types';

/** 保存する形のタスクを作る（指定しない項目は正しい値） */
function savedTask(fields: Partial<SavedTask> = {}): SavedTask {
  return {
    id: 't1',
    name: 'タスク',
    effort: 1,
    progress: 0,
    priority: 'mid',
    due: null,
    memo: '',
    children: [],
    ...fields,
  };
}

/** 保存する形のデータ。「要件定義」に tasks を入れる */
function savedData(tasks: SavedTask[] = [savedTask()]): SavedAppData {
  return {
    version: 1,
    activeId: 'p1',
    projects: [
      {
        id: 'p1',
        name: 'PJT',
        start: '2026-11-16',
        end: null,
        overtime: false,
        phases: [
          { id: 'req', name: '要件定義', tasks },
          { id: 'design', name: '設計', tasks: [] },
          { id: 'impl', name: '実装', tasks: [] },
          { id: 'test', name: 'テスト', tasks: [] },
          { id: 'release', name: 'リリース', tasks: [] },
        ],
      },
    ],
    daysOff: [{ date: '2026-12-29', label: '年末休業' }],
  };
}

/** JSON に書いて読み戻す（localStorage・バックアップファイルを通るのと同じ） */
function viaJson<T>(value: T): unknown {
  return JSON.parse(JSON.stringify(value));
}

/** 読み込みに失敗したときの理由を取り出す */
function reasonOf(saved: unknown): string {
  const result = fromSaved(saved);
  if (result.ok) throw new Error('読み込めてしまった');
  return result.reason;
}

describe('2-9 保存する形とメモリの形の変換', () => {
  it('工数・進捗率を、小数（保存する形）と整数（メモリの形）で行き来する', () => {
    const result = fromSaved(savedData([savedTask({ effort: 3.5, progress: 0.6 })]));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const task = result.data.projects[0]!.phases[0]!.tasks[0]!;
    expect(task.effortTenths).toBe(35);
    expect(task.progressPct).toBe(60);

    const saved = toSaved(result.data).projects[0]!.phases[0]!.tasks[0]!;
    expect(saved.effort).toBe(3.5);
    expect(saved.progress).toBe(0.6);
    expect(saved).not.toHaveProperty('effortTenths');
    expect(saved).not.toHaveProperty('progressPct');
  });

  it('小数の誤差がある値も、四捨五入で正しい整数になる', () => {
    // 0.1 + 0.2 = 0.30000000000000004、0.07 × 100 = 7.000000000000001
    const result = fromSaved(savedData([savedTask({ effort: 0.1 + 0.2, progress: 0.07 })]));
    if (!result.ok) throw new Error(result.reason);
    expect(result.data.projects[0]!.phases[0]!.tasks[0]).toMatchObject({
      effortTenths: 3,
      progressPct: 7,
    });
  });

  it('サンプルPJTを書き出して読み戻すと、元どおりになる', () => {
    const data = createInitialAppData('2026-11-19');
    const result = fromSaved(viaJson(toSaved(data)));
    expect(result).toEqual({ ok: true, data });
  });

  it('すべての工数（0.0〜99.9）と進捗率（0〜100）が、書き出して読み戻しても変わらない', () => {
    const tasks: SavedTask[] = [];
    for (let e = 0; e < 1000; e++) {
      tasks.push(savedTask({ id: `t${e}`, effort: e / 10, progress: (e % 101) / 100 }));
    }
    const first = fromSaved(savedData(tasks));
    if (!first.ok) throw new Error(first.reason);
    const again = fromSaved(viaJson(toSaved(first.data)));
    expect(again).toEqual(first);
    const values = first.data.projects[0]!.phases[0]!.tasks.map((t) => [
      t.effortTenths,
      t.progressPct,
    ]);
    expect(values).toEqual(tasks.map((_, e) => [e, e % 101]));
  });

  it('余分な項目は読み飛ばす。工程の名前は決まった名前にする', () => {
    const saved = savedData();
    const raw = viaJson(saved) as Record<string, unknown> & typeof saved;
    raw.extra = 'x';
    raw.projects[0]!.phases[0]!.name = '別の名前';
    const result = fromSaved(raw);
    if (!result.ok) throw new Error(result.reason);
    expect(result.data).not.toHaveProperty('extra');
    expect(result.data.projects[0]!.phases[0]!.name).toBe('要件定義');
  });

  it('孫までは読み込める', () => {
    const grandchild = savedTask({ id: 'c3' });
    const child = savedTask({ id: 'c2', children: [grandchild] });
    expect(fromSaved(savedData([savedTask({ id: 'c1', children: [child] })])).ok).toBe(true);
  });
});

describe('2-9 壊れたデータは読み込まずに理由を返す', () => {
  it('データがオブジェクトでない', () => {
    expect(reasonOf(null)).toBe('データの形が正しくありません');
    expect(reasonOf('文字列')).toBe('データの形が正しくありません');
    expect(reasonOf([])).toBe('データの形が正しくありません');
  });

  it('バージョンが正しくない・今より新しい', () => {
    expect(reasonOf({ ...savedData(), version: '1' })).toBe('version が正しくありません');
    expect(reasonOf({ ...savedData(), version: 0 })).toBe('version が正しくありません');
    expect(reasonOf({ ...savedData(), version: CURRENT_VERSION + 1 })).toBe(
      `新しいバージョン（${CURRENT_VERSION + 1}）のアプリで保存されたデータのため、読み込めません`,
    );
  });

  it('PJTがない・表示中のPJTが見つからない', () => {
    expect(reasonOf({ ...savedData(), projects: [] })).toBe('PJTが1つもありません');
    expect(reasonOf({ ...savedData(), activeId: 'p9' })).toBe(
      '表示中のPJT（activeId）が見つかりません',
    );
  });

  it('日付の書式が正しくない・実在しない日付', () => {
    const data = savedData();
    data.projects[0]!.start = '2026/11/16';
    expect(reasonOf(data)).toBe('PJT 1：start が正しい日付（YYYY-MM-DD）ではありません');
    data.projects[0]!.start = '2026-02-30';
    expect(reasonOf(data)).toBe('PJT 1：start が正しい日付（YYYY-MM-DD）ではありません');
  });

  it('工数が負の数・進捗率が 0〜1 の外', () => {
    expect(reasonOf(savedData([savedTask({ effort: -1 })]))).toBe(
      'PJT 1 › 工程「要件定義」 › タスク 1：effort（工数）が 0 以上の数ではありません',
    );
    expect(reasonOf(savedData([savedTask({ progress: 60 })]))).toBe(
      'PJT 1 › 工程「要件定義」 › タスク 1：progress（進捗率）が 0〜1 の数ではありません',
    );
  });

  it('優先度が high / mid / low 以外', () => {
    const bad = { ...savedTask(), priority: 'urgent' };
    expect(reasonOf(savedData([bad as SavedTask]))).toBe(
      'PJT 1 › 工程「要件定義」 › タスク 1：priority が high / mid / low のどれでもありません',
    );
  });

  it('工程が5本でない・順番が違う', () => {
    const data = savedData();
    data.projects[0]!.phases.pop();
    expect(reasonOf(data)).toBe('PJT 1：工程が 5 本ではありません');

    const swapped = savedData();
    const phases = swapped.projects[0]!.phases;
    [phases[0], phases[1]] = [phases[1]!, phases[0]!];
    expect(reasonOf(swapped)).toBe(
      'PJT 1 › 工程「要件定義」：1 本目の工程が「要件定義」ではありません',
    );
  });

  it('階層が孫より深い', () => {
    const great = savedTask({ id: 'c4' });
    const grand = savedTask({ id: 'c3', children: [great] });
    const child = savedTask({ id: 'c2', children: [grand] });
    expect(reasonOf(savedData([savedTask({ id: 'c1', children: [child] })]))).toBe(
      'PJT 1 › 工程「要件定義」 › タスク 1 › 子 1 › 子 1 › 子 1：階層が孫より深くなっています',
    );
  });

  it('id が重なっている', () => {
    expect(reasonOf(savedData([savedTask({ id: 'a' }), savedTask({ id: 'a' })]))).toBe(
      'PJT 1 › 工程「要件定義」 › タスク 2：id「a」が重なっています',
    );
  });

  it('休業日の形が正しくない', () => {
    const data = savedData();
    data.daysOff.push({ date: '12/30', label: '年末休業' });
    expect(reasonOf(data)).toBe('休業日 2：date が正しい日付（YYYY-MM-DD）ではありません');
  });
});
