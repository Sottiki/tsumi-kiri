/**
 * ドラッグでの並べ替えの計算（src/ui/board/reorder.ts）のテスト。
 *
 * 画面案のデータ（docs/test-cases.md 1章）の設計の工程を使う：
 *   2       設計
 *   2-1     基本設計（親）
 *   2-1-1     画面設計
 *   2-1-2     DB設計
 *   2-2     詳細設計
 *
 * 兄弟の判定・落とす位置・青い線の行を確かめ、最後に core の reorderTask と組み合わせて、
 * 落とした結果の並びが思ったとおりになるかを確かめる。
 */

import { describe, expect, it } from 'vitest';
import { schedule } from '../../src/core/schedule';
import { reorderTask } from '../../src/core/tree';
import type { Project } from '../../src/core/types';
import { dragGroupOf, dropTargetFor, gapAt, type DragGroup } from '../../src/ui/board/reorder';
import { layoutRows, type RowLayout } from '../../src/ui/board/rowLayout';
import { mockupProject, project, task } from '../helpers';

/** PJTから、画面に並べる行を作る。collapsedLabels は、たたむ親の ID（'2-1' など） */
function layoutsOf(pjt: Project, collapsedLabels: string[] = []): RowLayout[] {
  const rows = schedule(pjt, [], 8);
  const collapsed = new Set(
    rows.filter((row) => collapsedLabels.includes(row.label)).map((row) => row.key),
  );
  return layoutRows(rows, collapsed);
}

/** ID（'2-1'）から、タスクの id を引く */
function keyOf(layouts: RowLayout[], label: string): string {
  const layout = layouts.find((l) => l.row.label === label);
  if (layout === undefined) throw new Error(`行 ${label} がありません`);
  return layout.row.key;
}

/** id の並びを、ID（'2-1'）の並びに直す。期待する値を読みやすく書くため */
function labelsOf(layouts: RowLayout[], keys: string[]): string[] {
  return keys.map((key) => layouts.find((l) => l.row.key === key)?.row.label ?? key);
}

/** dragGroupOf を呼び、null ならテストを失敗させる */
function groupOf(layouts: RowLayout[], label: string): DragGroup {
  const group = dragGroupOf(layouts, keyOf(layouts, label));
  if (group === null) throw new Error(`${label} を掴めません`);
  return group;
}

describe('dragGroupOf：兄弟とかたまり', () => {
  it('工程の直下のタスクを掴むと、同じ工程の直下のタスクが兄弟になる。子は親のかたまりに入る', () => {
    const layouts = layoutsOf(mockupProject());
    const group = groupOf(layouts, '2-2');
    expect(labelsOf(layouts, group.siblingKeys)).toEqual(['2-1', '2-2']);
    expect(group.activeIndex).toBe(1);
    expect(group.level).toBe(1);
    expect(group.blocks.map((block) => labelsOf(layouts, block))).toEqual([
      ['2-1', '2-1-1', '2-1-2'],
      ['2-2'],
    ]);
  });

  it('子を掴むと、同じ親の子だけが兄弟になる（親の外の行は入らない）', () => {
    const layouts = layoutsOf(mockupProject());
    const group = groupOf(layouts, '2-1-1');
    expect(labelsOf(layouts, group.siblingKeys)).toEqual(['2-1-1', '2-1-2']);
    expect(group.activeIndex).toBe(0);
    expect(group.level).toBe(2);
  });

  it('ほかの工程のタスクは兄弟に入らない', () => {
    const layouts = layoutsOf(mockupProject());
    // 要件定義の 1-2 の兄弟は 1-1 と 1-2 だけ（次の工程の 2-1 は入らない）
    expect(labelsOf(layouts, groupOf(layouts, '1-2').siblingKeys)).toEqual(['1-1', '1-2']);
  });

  it('たたんだ親のかたまりは、親の行だけになる（隠れている子は測れないので入れない）', () => {
    const layouts = layoutsOf(mockupProject(), ['2-1']);
    const group = groupOf(layouts, '2-2');
    expect(group.blocks.map((block) => labelsOf(layouts, block))).toEqual([['2-1'], ['2-2']]);
  });

  it('工程の行と、たたんで隠れている行は掴めない', () => {
    const layouts = layoutsOf(mockupProject(), ['2-1']);
    expect(dragGroupOf(layouts, keyOf(layouts, '2'))).toBeNull(); // 工程
    expect(dragGroupOf(layouts, keyOf(layouts, '2-1-1'))).toBeNull(); // 隠れている
    expect(dragGroupOf(layouts, 'ない id')).toBeNull();
  });

  it('孫まであるとき、孫の行も子のかたまりに入る', () => {
    const pjt = project({
      tasksByPhase: [
        [
          task('親', {
            children: [
              task('子A', { children: [task('孫1', { effort: 1 }), task('孫2', { effort: 1 })] }),
              task('子B', { effort: 1 }),
            ],
          }),
        ],
      ],
    });
    const layouts = layoutsOf(pjt);
    const group = groupOf(layouts, '1-1-2');
    expect(group.blocks.map((block) => labelsOf(layouts, block))).toEqual([
      ['1-1-1', '1-1-1-1', '1-1-1-2'],
      ['1-1-2'],
    ]);
  });
});

describe('gapAt：指の位置から、すき間を決める', () => {
  // かたまりの縦の範囲。1つ目は親と子2つで 120px、2つ目は 40px
  const rects = [
    { top: 100, bottom: 220 },
    { top: 220, bottom: 260 },
  ];

  it('かたまりの上半分なら前のすき間、下半分なら後ろのすき間', () => {
    expect(gapAt(rects, 120)).toBe(0); // 1つ目の上半分（真ん中は 160）
    expect(gapAt(rects, 200)).toBe(1); // 1つ目の下半分
    expect(gapAt(rects, 230)).toBe(1); // 2つ目の上半分（真ん中は 240）
    expect(gapAt(rects, 250)).toBe(2); // 2つ目の下半分 → 最後の後ろ
  });

  it('兄弟の範囲の外なら null（別の階層・別の工程には落とせない）', () => {
    expect(gapAt(rects, 99)).toBeNull();
    expect(gapAt(rects, 261)).toBeNull();
    expect(gapAt([], 100)).toBeNull();
  });

  it('範囲のちょうど端は、範囲の中に入れる', () => {
    expect(gapAt(rects, 100)).toBe(0);
    expect(gapAt(rects, 260)).toBe(2);
  });
});

describe('dropTargetFor：落とす先と、青い線の行', () => {
  it('自分のすぐ前とすぐ後ろのすき間では、並びが変わらないので null', () => {
    const layouts = layoutsOf(mockupProject());
    const group = groupOf(layouts, '2-2'); // 2番目（activeIndex 1）
    expect(dropTargetFor(group, 1)).toBeNull();
    expect(dropTargetFor(group, 2)).toBeNull();
  });

  it('上へ動かすときは、すき間の後ろの兄弟の前に入る。線はその兄弟の行の上端', () => {
    const layouts = layoutsOf(mockupProject());
    const target = dropTargetFor(groupOf(layouts, '2-2'), 0);
    expect(target).toEqual({
      overKey: keyOf(layouts, '2-1'),
      line: { rowKey: keyOf(layouts, '2-1'), edge: 'before' },
    });
  });

  it('最後へ動かすときは、線を最後のかたまりのいちばん下の行（子孫の行）の下端に引く', () => {
    const layouts = layoutsOf(mockupProject());
    // 最後の兄弟が子を持つ形：末端A、親B（子B1・子B2）。A を最後へ動かすと、線は子B2 の下端
    const pjt = project({
      tasksByPhase: [
        [
          task('末端A', { effort: 1 }),
          task('親B', { children: [task('子B1', { effort: 1 }), task('子B2', { effort: 1 })] }),
        ],
      ],
    });
    const deep = layoutsOf(pjt);
    const target = dropTargetFor(groupOf(deep, '1-1'), 2);
    expect(target).toEqual({
      overKey: keyOf(deep, '1-2'),
      line: { rowKey: keyOf(deep, '1-2-2'), edge: 'after' },
    });
    // 画面案のデータでは、2-1 を最後へ動かすと、線は 2-2 の下端
    const fromMockup = dropTargetFor(groupOf(layouts, '2-1'), 2);
    expect(fromMockup?.line).toEqual({ rowKey: keyOf(layouts, '2-2'), edge: 'after' });
  });

  it('範囲の外のすき間は null', () => {
    const layouts = layoutsOf(mockupProject());
    const group = groupOf(layouts, '2-2');
    expect(dropTargetFor(group, -1)).toBeNull();
    expect(dropTargetFor(group, 3)).toBeNull();
  });
});

describe('落とした結果（core の reorderTask と組み合わせる）', () => {
  /** 兄弟が4つの工程。A B C D の名前で並びを確かめる */
  function fourSiblings(): Project {
    return project({
      tasksByPhase: [
        [
          task('A', { effort: 1 }),
          task('B', { effort: 1 }),
          task('C', { effort: 1 }),
          task('D', { effort: 1 }),
        ],
      ],
    });
  }
  /** 工程1の直下のタスクの名前の並び */
  const namesOf = (pjt: Project) => pjt.phases[0]!.tasks.map((t) => t.name);

  /** label のタスクを掴み、すき間 gap に落とした後の並び */
  function dropAt(pjt: Project, label: string, gap: number): string[] {
    const layouts = layoutsOf(pjt);
    const group = groupOf(layouts, label);
    const target = dropTargetFor(group, gap);
    if (target === null) return namesOf(pjt);
    return namesOf(reorderTask(pjt, group.activeKey, target.overKey));
  }

  it('下へ：B を C と D の間（すき間 3）に落とすと、C の後ろに入る', () => {
    expect(dropAt(fourSiblings(), '1-2', 3)).toEqual(['A', 'C', 'B', 'D']);
  });

  it('下へ：B を最後（すき間 4）に落とすと、末尾に入る', () => {
    expect(dropAt(fourSiblings(), '1-2', 4)).toEqual(['A', 'C', 'D', 'B']);
  });

  it('上へ：C を先頭（すき間 0）に落とすと、先頭に入る', () => {
    expect(dropAt(fourSiblings(), '1-3', 0)).toEqual(['C', 'A', 'B', 'D']);
  });

  it('上へ：D を A と B の間（すき間 1）に落とすと、B の前に入る', () => {
    expect(dropAt(fourSiblings(), '1-4', 1)).toEqual(['A', 'D', 'B', 'C']);
  });

  it('自分のすぐ前・すぐ後ろに落としても、並びは変わらない', () => {
    expect(dropAt(fourSiblings(), '1-2', 1)).toEqual(['A', 'B', 'C', 'D']);
    expect(dropAt(fourSiblings(), '1-2', 2)).toEqual(['A', 'B', 'C', 'D']);
  });

  it('TC-42：詳細設計（2-2）を先頭に落とすと、基本設計とその子がまとめて後ろへ動く', () => {
    const pjt = mockupProject();
    const layouts = layoutsOf(pjt);
    const group = groupOf(layouts, '2-2');
    const target = dropTargetFor(group, 0);
    expect(target).not.toBeNull();
    const moved = reorderTask(pjt, group.activeKey, target!.overKey);

    // 設計の工程の並び：詳細設計が先頭になり、基本設計は子を連れたまま後ろへ
    const design = moved.phases[1]!.tasks;
    expect(design.map((t) => t.name)).toEqual(['詳細設計', '基本設計']);
    expect(design[1]!.children.map((t) => t.name)).toEqual(['画面設計', 'DB設計']);
    // ID は並びから振り直される（TC-42）：基本設計が 2-2、画面設計が 2-2-1
    const movedLayouts = layoutsOf(moved);
    expect(keyOf(movedLayouts, '2-1')).toBe(design[0]!.id);
    expect(keyOf(movedLayouts, '2-2')).toBe(design[1]!.id);
    expect(keyOf(movedLayouts, '2-2-1')).toBe(design[1]!.children[0]!.id);
  });
});
