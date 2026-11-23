/**
 * core/sample.ts のテスト（tasks.md 段階2：2-8）
 */
import { describe, expect, it } from 'vitest';
import { createInitialAppData, createSampleProject } from '../src/core/sample';
import type { Project, Task } from '../src/core/types';

/** 末端のタスクを、上から順に1列に並べる */
function leaves(project: Project): Task[] {
  const walk = (tasks: Task[]): Task[] =>
    tasks.flatMap((t) => (t.children.length ? walk(t.children) : [t]));
  return project.phases.flatMap((ph) => walk(ph.tasks));
}

describe('2-8 サンプルPJT', () => {
  it('画面案の「今日」（2026-11-19）に開くと、画面案と同じ日付になる', () => {
    const p = createSampleProject('2026-11-19');
    expect(p.name).toBe('社内ポータル刷新');
    expect(p.start).toBe('2026-11-16');
    expect(p.end).toBe('2026-12-25');
    expect(p.overtime).toBe(false);
  });

  it('中身は docs/test-cases.md 1章の表と同じ', () => {
    const p = createSampleProject('2026-11-19');
    expect(
      leaves(p).map((t) => [t.name, t.effortTenths, t.progressPct, t.due, t.priority]),
    ).toEqual([
      ['現状ヒアリング', 20, 100, null, 'high'],
      ['要件定義書作成', 30, 60, null, 'high'],
      ['画面設計', 30, 0, null, 'high'],
      ['DB設計', 20, 0, null, 'mid'],
      ['詳細設計', 40, 0, null, 'mid'],
      ['一覧画面', 40, 0, null, 'mid'],
      ['詳細画面', 35, 0, '2026-12-18', 'mid'],
      ['API実装', 50, 0, null, 'high'],
      ['結合テスト', 40, 0, null, 'mid'],
      ['受入テスト対応', 20, 0, null, 'low'],
      ['本番リリース', 10, 0, '2026-12-25', 'high'],
    ]);
    // 親タスク（基本設計・フロント実装）は工程の直下にある
    expect(p.phases[1]!.tasks[0]!.name).toBe('基本設計');
    expect(p.phases[2]!.tasks[0]!.name).toBe('フロント実装');
    // 総工数 33.5 人日（TC-04）
    expect(leaves(p).reduce((sum, t) => sum + t.effortTenths, 0)).toBe(335);
  });

  it('開始日は開いた週の月曜。エンド日と期日も同じ日数だけずらす', () => {
    // 2026-11-23(月)：1週間後ろへずれる
    const next = createSampleProject('2026-11-23');
    expect(next.start).toBe('2026-11-23');
    expect(next.end).toBe('2027-01-01');
    expect(leaves(next).flatMap((t) => (t.due ? [t.due] : []))).toEqual([
      '2026-12-25',
      '2027-01-01',
    ]);

    // 2026-11-22(日)：日曜は前の週の続きなので、11/16(月) の週
    expect(createSampleProject('2026-11-22').start).toBe('2026-11-16');
    // 年をまたいでもずらせる（2027-03-03 は水曜 → 03-01 の月曜）
    const later = createSampleProject('2027-03-03');
    expect(later.start).toBe('2027-03-01');
    expect(later.end).toBe('2027-04-09');
  });

  it('id はすべて違う', () => {
    const p = createSampleProject('2026-11-19');
    const ids: string[] = [p.id];
    const walk = (tasks: Task[]) =>
      tasks.forEach((t) => {
        ids.push(t.id);
        walk(t.children);
      });
    p.phases.forEach((ph) => walk(ph.tasks));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('初めて開いたときのデータ：サンプルPJTが1つ、それを表示中、休業日は空', () => {
    const data = createInitialAppData('2026-11-19');
    expect(data.version).toBe(1);
    expect(data.projects).toHaveLength(1);
    expect(data.activeId).toBe(data.projects[0]!.id);
    expect(data.daysOff).toEqual([]);
  });
});
