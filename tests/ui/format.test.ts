/**
 * 画面に出す書式（src/ui/format.ts）のテスト。
 */

import { describe, expect, it } from 'vitest';
import { schedule } from '../../src/core/schedule';
import { formatTenths, rowProgressPct } from '../../src/ui/format';
import { mockupProject, rowOf, scheduleByLabel } from '../helpers';

describe('formatTenths', () => {
  it('0.1人日単位の整数を、小数1桁で出す', () => {
    expect(formatTenths(35)).toBe('3.5');
    expect(formatTenths(20)).toBe('2.0');
    expect(formatTenths(0)).toBe('0.0');
    expect(formatTenths(335)).toBe('33.5');
    expect(formatTenths(1)).toBe('0.1');
  });
});

describe('rowProgressPct', () => {
  it('末端は入力した値、工程は丸めた値（画面案のデータ）', () => {
    const rows = scheduleByLabel(mockupProject(), 8);
    expect(rowProgressPct(rowOf(rows, '1-2'))).toBe(60);
    expect(rowProgressPct(rowOf(rows, '1'))).toBe(80); // (100 + 60) ÷ 2
  });

  it('親の平均が 99.5% でも、100% とは出さない（SPEC 4章）', () => {
    // 子が 100% と 99% の親：平均 99.5 → 四捨五入すると 100 だが、完了ではないので 99
    const pjt = mockupProject();
    const parent = pjt.phases[1]?.tasks[0];
    if (parent === undefined) throw new Error('基本設計がありません');
    parent.children = parent.children.map((child, i) => ({
      ...child,
      progressPct: i === 0 ? 100 : 99,
    }));
    const row = schedule(pjt, [], 8).find((r) => r.label === '2-1');
    if (row === undefined) throw new Error('2-1 がありません');
    expect(rowProgressPct(row)).toBe(99);
  });
});
