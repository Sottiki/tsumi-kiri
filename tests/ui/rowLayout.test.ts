/**
 * タスク表の行の並べ方（src/ui/board/rowLayout.ts）のテスト。
 * 子の数・ツリー線・たたんだときに隠れる行を、行の並び（階層）から正しく出せるかを確かめる。
 */

import { describe, expect, it } from 'vitest';
import { schedule } from '../../src/core/schedule';
import type { ScheduleRow } from '../../src/core/types';
import { layoutRows, type RowLayout } from '../../src/ui/board/rowLayout';
import { mockupProject, project, task } from '../helpers';

/** 並べ方を ID（'1-2-1'）で引けるようにする */
function byLabel(layouts: RowLayout[]): Map<string, RowLayout> {
  return new Map(layouts.map((layout) => [layout.row.label, layout]));
}

/** Map から取り出す。なければテストを失敗させる */
function get(layouts: Map<string, RowLayout>, label: string): RowLayout {
  const layout = layouts.get(label);
  if (layout === undefined) throw new Error(`行 ${label} がありません`);
  return layout;
}

/**
 * 孫まである工程（ツリー線の確かめ用）。
 *   1       要件定義
 *   1-1     親
 *   1-1-1     子A（孫を2つ持つ）
 *   1-1-1-1     孫1
 *   1-1-1-2     孫2
 *   1-1-2     子B
 *   1-2     末端
 */
function deepRows(): { rows: ScheduleRow[]; idOf: (label: string) => string } {
  const pjt = project({
    tasksByPhase: [
      [
        task('親', {
          children: [
            task('子A', {
              children: [task('孫1', { effort: 1 }), task('孫2', { effort: 1 })],
            }),
            task('子B', { effort: 1 }),
          ],
        }),
        task('末端', { effort: 1 }),
      ],
    ],
  });
  const rows = schedule(pjt, [], 8);
  const idOf = (label: string) => {
    const row = rows.find((r) => r.label === label);
    if (row === undefined) throw new Error(`行 ${label} がありません`);
    return row.key;
  };
  return { rows, idOf };
}

describe('子の数', () => {
  it('画面案のデータで、親の子の数が出る', () => {
    const layouts = byLabel(layoutRows(schedule(mockupProject(), [], 8), new Set()));
    expect(get(layouts, '2-1').childCount).toBe(2); // 基本設計
    expect(get(layouts, '3-1').childCount).toBe(2); // フロント実装
    expect(get(layouts, '1-1').childCount).toBe(0); // 末端
    expect(get(layouts, '2').childCount).toBe(2); // 工程：直下のタスク（基本設計・詳細設計）
  });

  it('孫は、親の子の数に入れない（直下の子だけを数える）', () => {
    const { rows } = deepRows();
    const layouts = byLabel(layoutRows(rows, new Set()));
    expect(get(layouts, '1-1').childCount).toBe(2); // 子A・子B
    expect(get(layouts, '1-1-1').childCount).toBe(2); // 孫1・孫2
  });

  it('タスクのない工程は 0', () => {
    const layouts = byLabel(layoutRows(schedule(project({ tasksByPhase: [] }), [], 8), new Set()));
    expect(get(layouts, '1').childCount).toBe(0);
  });
});

describe('ツリー線', () => {
  it('兄弟の中で最後の行が分かる', () => {
    const layouts = byLabel(layoutRows(schedule(mockupProject(), [], 8), new Set()));
    expect(get(layouts, '2-1-1').isLastSibling).toBe(false);
    expect(get(layouts, '2-1-2').isLastSibling).toBe(true);
    // 工程の最後のタスク（次は別の工程の行）
    expect(get(layouts, '2-2').isLastSibling).toBe(true);
  });

  it('祖先の下に兄弟が続くなら、その祖先の縦線を孫の行にも通す', () => {
    const { rows } = deepRows();
    const layouts = byLabel(layoutRows(rows, new Set()));
    // 子A の後ろに子B が続くので、孫の行には子の階層（2）の縦線を通す
    expect(get(layouts, '1-1-1-1').continuingLevels).toEqual([2]);
    expect(get(layouts, '1-1-1-2').continuingLevels).toEqual([2]);
    // 子の行には、通す祖先の線はない（階層1の親は縦線で結ばない）
    expect(get(layouts, '1-1-1').continuingLevels).toEqual([]);
    expect(get(layouts, '1-1-2').continuingLevels).toEqual([]);
  });

  it('祖先が兄弟の最後なら、その縦線は通さない', () => {
    const pjt = project({
      tasksByPhase: [
        [
          task('親', {
            children: [
              task('子A', { effort: 1 }),
              task('子B（最後）', { children: [task('孫', { effort: 1 })] }),
            ],
          }),
        ],
      ],
    });
    const layouts = byLabel(layoutRows(schedule(pjt, [], 8), new Set()));
    expect(get(layouts, '1-1-2-1').continuingLevels).toEqual([]);
  });
});

describe('親の開閉', () => {
  it('たたんだ親の子孫だけを隠す', () => {
    const { rows, idOf } = deepRows();
    const layouts = byLabel(layoutRows(rows, new Set([idOf('1-1-1')])));
    expect(get(layouts, '1-1-1').hidden).toBe(false);
    expect(get(layouts, '1-1-1').collapsed).toBe(true);
    expect(get(layouts, '1-1-1-1').hidden).toBe(true);
    expect(get(layouts, '1-1-1-2').hidden).toBe(true);
    // たたんだ親の兄弟と、その後ろの行は出す
    expect(get(layouts, '1-1-2').hidden).toBe(false);
    expect(get(layouts, '1-2').hidden).toBe(false);
  });

  it('上の親をたたむと、中でたたんでいる親も含めて子孫をすべて隠す', () => {
    const { rows, idOf } = deepRows();
    const layouts = byLabel(layoutRows(rows, new Set([idOf('1-1'), idOf('1-1-1')])));
    for (const label of ['1-1-1', '1-1-1-1', '1-1-1-2', '1-1-2']) {
      expect(get(layouts, label).hidden).toBe(true);
    }
    expect(get(layouts, '1-1').hidden).toBe(false);
    expect(get(layouts, '1-2').hidden).toBe(false);
  });

  it('末端の id がたたむ一覧に入っていても、何も隠さない', () => {
    const { rows, idOf } = deepRows();
    const layouts = layoutRows(rows, new Set([idOf('1-2')]));
    expect(layouts.every((layout) => !layout.hidden && !layout.collapsed)).toBe(true);
  });

  it('何もたたんでいなければ、すべての行を出す', () => {
    const layouts = layoutRows(schedule(mockupProject(), [], 8), new Set());
    expect(layouts.filter((layout) => layout.hidden)).toEqual([]);
    expect(layouts).toHaveLength(18); // 工程5 ＋ タスク13
  });
});
