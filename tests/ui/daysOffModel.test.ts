/**
 * 休業日・有給のダイアログの決まり（src/ui/daysOffModel.ts）のテスト（tasks.md 8-2、決定事項81）
 *
 * 暦の確かめ（2026年末〜2027年始）：
 *   12/29(火) 12/30(水) 12/31(木) 1/1(金・元日) 1/2(土) 1/3(日) 1/4(月)
 */

import { describe, expect, it } from 'vitest';
import { addedMessage, groupByYear, MAX_RANGE_DAYS, planDaysOff } from '../../src/ui/daysOffModel';

describe('planDaysOff：足す日', () => {
  it('期間の中の平日だけを足す（12/29〜1/3 → 12/29・12/30・12/31。土日・祝日の3日は飛ばす）', () => {
    expect(planDaysOff({ start: '2026-12-29', end: '2027-01-03', label: '年末休業' })).toEqual({
      ok: true,
      days: [
        { date: '2026-12-29', label: '年末休業' },
        { date: '2026-12-30', label: '年末休業' },
        { date: '2026-12-31', label: '年末休業' },
      ],
      skipped: 3,
    });
  });

  it('終了日が空なら、開始日の1日だけ。名前は前後の空白を取り除き、空でもよい', () => {
    expect(planDaysOff({ start: '2026-12-01', end: '', label: '  有給 ' })).toEqual({
      ok: true,
      days: [{ date: '2026-12-01', label: '有給' }],
      skipped: 0,
    });
    expect(planDaysOff({ start: '2026-12-01', end: '', label: '' })).toEqual({
      ok: true,
      days: [{ date: '2026-12-01', label: '' }],
      skipped: 0,
    });
  });

  it('開始日と終了日が同じでも、1日だけ', () => {
    const plan = planDaysOff({ start: '2026-12-01', end: '2026-12-01', label: '' });
    expect(plan.ok && plan.days).toEqual([{ date: '2026-12-01', label: '' }]);
  });

  it('期間は 366日まで足せる。367日は足さない', () => {
    // 2027-01-01 から 366日目は 2028-01-01（2027年は 365日）
    expect(planDaysOff({ start: '2027-01-01', end: '2028-01-01', label: '' }).ok).toBe(true);
    expect(planDaysOff({ start: '2027-01-01', end: '2028-01-02', label: '' })).toEqual({
      ok: false,
      message: `期間は ${MAX_RANGE_DAYS}日（1年）までにしてください。`,
    });
  });
});

describe('planDaysOff：足さないとき', () => {
  it('土日・祝日の1日だけを指定したら、足さずに理由を出す', () => {
    expect(planDaysOff({ start: '2027-01-02', end: '', label: '' })).toEqual({
      ok: false,
      message: '1/2(土) は土日・祝日のため、もともと休みです。足す必要はありません。',
    });
    expect(planDaysOff({ start: '2027-01-01', end: '', label: '' }).ok).toBe(false); // 元日
  });

  it('期間の中に平日がなければ、足さずに理由を出す', () => {
    expect(planDaysOff({ start: '2027-01-01', end: '2027-01-03', label: '' })).toEqual({
      ok: false,
      message: '期間の中に平日がありません。土日・祝日は、もともと休みです。',
    });
  });

  it('開始日が空・範囲の外（2026〜2050年でない）なら、足さない', () => {
    const message = '開始日を 2026〜2050年の日付で入れてください。';
    expect(planDaysOff({ start: '', end: '', label: '' })).toEqual({ ok: false, message });
    expect(planDaysOff({ start: '2025-12-31', end: '', label: '' })).toEqual({
      ok: false,
      message,
    });
    expect(planDaysOff({ start: '2051-01-02', end: '', label: '' })).toEqual({
      ok: false,
      message,
    });
  });

  it('終了日が範囲の外、または開始日より前なら、足さない', () => {
    expect(planDaysOff({ start: '2026-12-01', end: '0002-12-05', label: '' })).toEqual({
      ok: false,
      message: '終了日を 2026〜2050年の日付で入れてください。',
    });
    expect(planDaysOff({ start: '2026-12-10', end: '2026-12-01', label: '' })).toEqual({
      ok: false,
      message: '終了日は、開始日と同じ日か後にしてください。',
    });
  });
});

describe('addedMessage：足した後の文', () => {
  it('飛ばした日がなければ、足した日数だけ。飛ばした日があれば、その日数も書く', () => {
    const one = [{ date: '2026-12-01', label: '' }];
    expect(addedMessage({ days: one, skipped: 0 })).toBe('1日を足しました。');
    expect(addedMessage({ days: one, skipped: 3 })).toBe(
      '1日を足しました。土日・祝日の3日は、もともと休みのため足していません。',
    );
  });
});

describe('groupByYear：一覧を年ごとにまとめる', () => {
  it('年をまたぐ一覧を、年の順にまとめる', () => {
    const daysOff = [
      { date: '2026-12-30', label: '年末休業' },
      { date: '2026-12-31', label: '年末休業' },
      { date: '2027-01-04', label: '有給' },
    ];
    expect(groupByYear(daysOff)).toEqual([
      { year: 2026, days: daysOff.slice(0, 2) },
      { year: 2027, days: daysOff.slice(2) },
    ]);
    expect(groupByYear([])).toEqual([]);
  });
});
