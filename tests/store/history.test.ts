/**
 * store/history.ts のテスト（tasks.md 3-3：元に戻す・やり直すの履歴）
 */
import { describe, expect, it } from 'vitest';
import { createProject } from '../../src/core/tree';
import type { AppData } from '../../src/core/types';
import {
  emptyHistory,
  HISTORY_LIMIT,
  keepViewState,
  MERGE_WINDOW_MS,
  recordChange,
  redo,
  undo,
} from '../../src/store/history';

/** 名前だけで見分けられる、小さなデータ。版の違いを名前で表す */
function version(name: string): AppData {
  return {
    version: 1,
    activeId: 'p',
    projects: [{ ...createProject('2026-11-16', () => 'p'), name }],
    daysOff: [],
  };
}
const nameOf = (d: AppData) => d.projects[0]!.name;

describe('記録と、元に戻す・やり直す', () => {
  it('戻すと前の版に、やり直すと戻す前の版になる', () => {
    let h = emptyHistory();
    h = recordChange(h, version('v1'), null, 0); // v1 → v2
    h = recordChange(h, version('v2'), null, 5000); // v2 → v3

    const back = undo(h, version('v3'))!;
    expect(nameOf(back.data)).toBe('v2');
    const back2 = undo(back.history, back.data)!;
    expect(nameOf(back2.data)).toBe('v1');
    expect(undo(back2.history, back2.data)).toBeNull(); // もう戻せない

    const forward = redo(back2.history, back2.data)!;
    expect(nameOf(forward.data)).toBe('v2');
  });

  it('戻した後に新しい変更をすると、やり直しの版は捨てる', () => {
    let h = recordChange(emptyHistory(), version('v1'), null, 0);
    const back = undo(h, version('v2'))!;
    h = recordChange(back.history, back.data, null, 5000);
    expect(h.future).toEqual([]);
    expect(redo(h, version('v3'))).toBeNull();
  });

  it(`上限は ${HISTORY_LIMIT} 件。超えたら古い版から捨てる`, () => {
    let h = emptyHistory();
    for (let i = 0; i < HISTORY_LIMIT + 5; i++) {
      h = recordChange(h, version(`v${i}`), null, i * 5000);
    }
    expect(h.past).toHaveLength(HISTORY_LIMIT);
    expect(nameOf(h.past[0]!)).toBe('v5');
  });
});

describe('同じ欄への続けての入力をまとめる', () => {
  const key = 'task:a:effortTenths';

  it(`同じ欄に ${MERGE_WINDOW_MS}ms 以内に続けて入力したら、1件にまとめる`, () => {
    let h = emptyHistory();
    h = recordChange(h, version('入力前'), key, 0);
    h = recordChange(h, version('3'), key, 400);
    h = recordChange(h, version('3.'), key, 800);
    // 前の入力から 1 秒以内なら、全体で 1 秒を超えても続けてまとめる
    h = recordChange(h, version('3.5'), key, 1700);
    expect(h.past).toHaveLength(1);
    // 戻すと、入力を始める前の版に一度で戻る
    expect(nameOf(undo(h, version('最後'))!.data)).toBe('入力前');
  });

  it('1 秒より空いたら、別の1件にする', () => {
    let h = recordChange(emptyHistory(), version('v1'), key, 0);
    h = recordChange(h, version('v2'), key, MERGE_WINDOW_MS + 1);
    expect(h.past).toHaveLength(2);
  });

  it('別の欄・まとめない変更（null）は、別の1件にする', () => {
    let h = recordChange(emptyHistory(), version('v1'), key, 0);
    h = recordChange(h, version('v2'), 'task:a:progressPct', 100);
    h = recordChange(h, version('v3'), null, 200);
    h = recordChange(h, version('v4'), null, 300);
    expect(h.past).toHaveLength(4);
  });

  it('戻した直後の入力は、戻す前の入力とまとめない', () => {
    let h = recordChange(emptyHistory(), version('v1'), key, 0);
    const back = undo(h, version('v2'))!;
    h = recordChange(back.history, back.data, key, 100);
    expect(h.past).toHaveLength(1);
    expect(nameOf(h.past[0]!)).toBe('v1');
  });
});

describe('表示の切り替えは戻さない（keepViewState）', () => {
  /** PJT a・b を持ち、それぞれの表示モードを指定したデータ */
  function twoProjects(activeId: string, overtime: { a: boolean; b: boolean }): AppData {
    return {
      version: 1,
      activeId,
      projects: (['a', 'b'] as const).map((id) => ({
        ...createProject('2026-11-16', () => id),
        overtime: overtime[id],
      })),
      daysOff: [],
    };
  }

  it('戻す先の版でも、今の表示中のPJTと表示モードを残す', () => {
    const old = twoProjects('a', { a: false, b: false });
    const current = twoProjects('b', { a: true, b: false });
    const kept = keepViewState(old, current);
    expect(kept.activeId).toBe('b');
    expect(kept.projects.map((p) => p.overtime)).toEqual([true, false]);
  });

  it('表示中のPJTが戻す先の版にないなら、先頭のPJTを表示する', () => {
    const old = twoProjects('a', { a: false, b: false });
    const current: AppData = { ...old, activeId: 'c' }; // c は、戻す先の版にないPJT
    expect(keepViewState(old, current).activeId).toBe('a');
  });
});
