/**
 * 詳細パネルに出す値の計算（src/ui/panel/panelModel.ts）のテスト。
 * 画面案のデータ（docs/test-cases.md 1章）を使う。
 */

import { describe, expect, it } from 'vitest';
import { schedule } from '../../src/core/schedule';
import { listMoveTargets } from '../../src/core/tree';
import type { ScheduleRow } from '../../src/core/types';
import { layoutRows } from '../../src/ui/board/rowLayout';
import {
  doneTenths,
  endTone,
  findNeighbors,
  parentOptions,
  PHASE_ROOT_LABEL,
} from '../../src/ui/panel/panelModel';
import { mockupProject, project, rowOf, scheduleByLabel, task } from '../helpers';

/** 画面案のデータを通常 8h で計算し、ID（'1-2'）と行の id を行き来できるようにする */
function mockup() {
  const pjt = mockupProject();
  const rows = schedule(pjt, [], 8);
  const keyOf = (label: string) => {
    const row = rows.find((r) => r.label === label);
    if (row === undefined) throw new Error(`行 ${label} がありません`);
    return row.key;
  };
  const labelOf = (key: string | null) => rows.find((r) => r.key === key)?.label ?? null;
  return { pjt, rows, keyOf, labelOf };
}

describe('前後のタスク（決定事項64）', () => {
  it('一覧の順にたどり、工程の帯を飛ばす', () => {
    const { rows, keyOf, labelOf } = mockup();
    const layouts = layoutRows(rows, new Set());
    // 1-2（要件定義の最後）の次は、工程の帯「2 設計」を飛ばして 2-1
    const at12 = findNeighbors(layouts, keyOf('1-2'));
    expect(labelOf(at12.prevId)).toBe('1-1');
    expect(labelOf(at12.nextId)).toBe('2-1');
    // 親の次は、その子
    expect(labelOf(findNeighbors(layouts, keyOf('2-1')).nextId)).toBe('2-1-1');
  });

  it('先頭と末尾では、その向きのタスクがない', () => {
    const { rows, keyOf } = mockup();
    const layouts = layoutRows(rows, new Set());
    expect(findNeighbors(layouts, keyOf('1-1')).prevId).toBeNull();
    expect(findNeighbors(layouts, keyOf('5-1')).nextId).toBeNull();
  });

  it('たたんで隠れている行は飛ばす', () => {
    const { rows, keyOf, labelOf } = mockup();
    // 2-1 基本設計をたたむと、2-1-1・2-1-2 は隠れる
    const layouts = layoutRows(rows, new Set([keyOf('2-1')]));
    expect(labelOf(findNeighbors(layouts, keyOf('2-1')).nextId)).toBe('2-2');
    expect(labelOf(findNeighbors(layouts, keyOf('2-2')).prevId)).toBe('2-1');
  });

  it('開いているタスク自身が隠れていても、前後の見えているタスクを探す', () => {
    const { rows, keyOf, labelOf } = mockup();
    const layouts = layoutRows(rows, new Set([keyOf('2-1')]));
    const neighbors = findNeighbors(layouts, keyOf('2-1-1'));
    expect(labelOf(neighbors.prevId)).toBe('2-1');
    expect(labelOf(neighbors.nextId)).toBe('2-2');
  });
});

describe('親タスクの選択肢（決定事項38）', () => {
  it('今の工程の中で、子を持つ親タスクだけを、ID つきで並べる', () => {
    const { pjt, keyOf, labelOf } = mockup();
    // 2-2 詳細設計（設計の工程の末端）：移せる親は 2-1 基本設計だけ
    const options = parentOptions(
      listMoveTargets(pjt, keyOf('2-2')),
      'design',
      (id) => labelOf(id) ?? undefined,
    );
    expect(options).toEqual([
      { parentId: null, label: PHASE_ROOT_LABEL },
      { parentId: keyOf('2-1'), label: '2-1 基本設計' },
    ]);
  });

  it('自分自身は選択肢に入らない', () => {
    const { pjt, keyOf, labelOf } = mockup();
    const options = parentOptions(
      listMoveTargets(pjt, keyOf('2-1')),
      'design',
      (id) => labelOf(id) ?? undefined,
    );
    expect(options.map((option) => option.label)).toEqual([PHASE_ROOT_LABEL]);
  });
});

describe('終わった分の工数', () => {
  it('工数 − 残工数。工数 3.0・進捗 60% なら 1.8', () => {
    const rows = scheduleByLabel(mockupProject(), 8);
    expect(doneTenths(rowOf(rows, '1-2'))).toBe(18);
  });

  it('親は子の合計から出す', () => {
    // 2-1 基本設計：画面設計 3.0 と DB設計 2.0。どちらも 0% なので、終わった分は 0
    const rows = scheduleByLabel(mockupProject(), 8);
    expect(doneTenths(rowOf(rows, '2-1'))).toBe(0);
  });
});

describe('日程の表の終了日の色（決定事項68）', () => {
  it('超過なら赤（over）、間に合えば緑（onTime）', () => {
    // 5-1 本番リリース：通常 8h は 1/4 でエンド日 12/25 を超える。残業 10h は 12/23 で間に合う
    const normal = scheduleByLabel(mockupProject(), 8);
    const overtime = scheduleByLabel(mockupProject(), 10);
    expect(endTone(rowOf(normal, '5-1'), '2026-12-25')).toBe('over');
    expect(endTone(rowOf(overtime, '5-1'), '2026-12-25')).toBe('onTime');
  });

  it('完了したタスクは色を付けない', () => {
    // 1-1 現状ヒアリングは進捗 100%
    const normal = scheduleByLabel(mockupProject(), 8);
    expect(endTone(rowOf(normal, '1-1'), '2026-12-25')).toBe('none');
  });

  it('エンド日が空欄なら色を付けない', () => {
    const pjt = project({ end: null, tasksByPhase: [[task('A', { effort: 1 })]] });
    const row = schedule(pjt, [], 8).find((r) => r.label === '1-1') as ScheduleRow;
    expect(endTone(row, null)).toBe('none');
  });
});
