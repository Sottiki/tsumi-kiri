/**
 * core/appData.ts のテスト（PJT・休業日の操作。段階3のストアから使う）
 */
import { describe, expect, it } from 'vitest';
import {
  activeProject,
  addDaysOff,
  addProject,
  deleteProject,
  removeDayOff,
  reorderProject,
  setActiveProject,
  setOvertime,
  updateActiveProject,
  updateProject,
} from '../src/core/appData';
import { createProject } from '../src/core/tree';
import type { AppData } from '../src/core/types';

/** PJT を ids の数だけ持つデータ。表示中は activeId */
function data(ids: string[], activeId = ids[0]!): AppData {
  return {
    version: 1,
    activeId,
    projects: ids.map((id) => ({ ...createProject('2026-11-16', () => id), name: id })),
    daysOff: [],
  };
}

const ids = (d: AppData) => d.projects.map((p) => p.id);

describe('PJTの追加・削除・並べ替え・切り替え', () => {
  it('追加したPJTは末尾に入り、表示中になる', () => {
    const d = addProject(
      data(['a']),
      createProject('2026-11-16', () => 'b'),
    );
    expect(ids(d)).toEqual(['a', 'b']);
    expect(d.activeId).toBe('b');
  });

  it('最後の1つは削除できない', () => {
    const d = data(['a']);
    expect(deleteProject(d, 'a')).toBe(d);
  });

  it('表示中のPJTを消すと右隣を、右がなければ左隣を表示する', () => {
    expect(deleteProject(data(['a', 'b', 'c'], 'b'), 'b').activeId).toBe('c');
    expect(deleteProject(data(['a', 'b', 'c'], 'c'), 'c').activeId).toBe('b');
    // 表示中でないPJTを消しても、表示は変わらない
    expect(deleteProject(data(['a', 'b', 'c'], 'a'), 'c').activeId).toBe('a');
  });

  it('並べ替え：落とした先の位置に入る', () => {
    expect(ids(reorderProject(data(['a', 'b', 'c']), 'a', 'c'))).toEqual(['b', 'c', 'a']);
    expect(ids(reorderProject(data(['a', 'b', 'c']), 'c', 'a'))).toEqual(['c', 'a', 'b']);
  });

  it('切り替え：ないPJTには切り替えない', () => {
    const d = data(['a', 'b']);
    expect(setActiveProject(d, 'b').activeId).toBe('b');
    expect(setActiveProject(d, 'x')).toBe(d);
  });

  it('updateActiveProject：表示中のPJTだけを変え、変わらなければ元のデータを返す', () => {
    const d = data(['a', 'b'], 'b');
    const next = updateActiveProject(d, (p) => setOvertime(p, true));
    expect(activeProject(next).overtime).toBe(true);
    expect(next.projects[0]).toBe(d.projects[0]); // 表示中でないPJTはそのまま
    expect(updateActiveProject(d, (p) => p)).toBe(d);
  });
});

describe('PJTの項目', () => {
  const p = createProject('2026-11-16', () => 'a');

  it('名前・開始日・エンド日を変える。エンド日は空欄にできる', () => {
    const next = updateProject(p, { name: '新しい名前', start: '2026-12-01', end: '2026-12-25' });
    expect(next).toMatchObject({ name: '新しい名前', start: '2026-12-01', end: '2026-12-25' });
    expect(updateProject(next, { end: null }).end).toBeNull();
  });

  it('正しくない日付は無視する。開始日は空欄にできない', () => {
    expect(updateProject(p, { start: '2026-02-30' })).toBe(p);
    expect(updateProject(p, { end: 'あした' })).toBe(p);
    // 型の上では start に null を渡せないが、画面からの値の取り違えに備えて確かめる
    expect(updateProject(p, { start: null as unknown as string })).toBe(p);
  });

  it('同じ値なら元のオブジェクトを返す', () => {
    expect(updateProject(p, { name: p.name, start: p.start })).toBe(p);
    expect(setOvertime(p, false)).toBe(p);
  });
});

describe('休業日・有給', () => {
  it('日付の順に並べ、同じ日付は新しい名前で置き換える', () => {
    let d = addDaysOff(data(['a']), [
      { date: '2026-12-30', label: '年末休業' },
      { date: '2026-12-28', label: '有給' },
    ]);
    d = addDaysOff(d, [{ date: '2026-12-30', label: '年末年始' }]);
    expect(d.daysOff).toEqual([
      { date: '2026-12-28', label: '有給' },
      { date: '2026-12-30', label: '年末年始' },
    ]);
  });

  it('正しくない日付は無視する', () => {
    const d = data(['a']);
    expect(addDaysOff(d, [{ date: '2026-13-01', label: 'x' }])).toBe(d);
  });

  it('削除する。ない日付なら何もしない', () => {
    const d = addDaysOff(data(['a']), [{ date: '2026-12-28', label: '有給' }]);
    expect(removeDayOff(d, '2026-12-28').daysOff).toEqual([]);
    expect(removeDayOff(d, '2026-12-29')).toBe(d);
  });
});
