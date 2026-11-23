/**
 * 稼働日の暦（core/calendar.ts）のテスト。test-cases.md 0.1 の暦を元にする。
 */

import { describe, expect, it } from 'vitest';
import {
  WorkCalendar,
  WorkdayNumbering,
  addDays,
  daysBetween,
  formatMonthDay,
  formatMonthDayWeekday,
  isJapaneseHoliday,
  isValidDateString,
  mondayOfWeek,
} from '../src/core/calendar';

describe('日付の文字列の計算', () => {
  it('月末・年末をまたいで日を足し引きできる', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2027-01-01', -1)).toBe('2026-12-31');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29'); // うるう年
  });

  it('警告文に使う形にできる', () => {
    expect(formatMonthDay('2026-12-25')).toBe('12/25');
    expect(formatMonthDayWeekday('2027-01-04')).toBe('1/4(月)');
    expect(formatMonthDayWeekday('2026-12-29')).toBe('12/29(火)');
  });
});

describe('稼働日の判定', () => {
  const calendar = new WorkCalendar([]);

  it('日本の祝日を同梱のデータから判定する（test-cases.md 0.1）', () => {
    expect(isJapaneseHoliday('2026-11-03')).toBe(true); // 文化の日
    expect(isJapaneseHoliday('2026-11-23')).toBe(true); // 勤労感謝の日
    expect(isJapaneseHoliday('2027-01-01')).toBe(true); // 元日
    expect(isJapaneseHoliday('2027-01-11')).toBe(true); // 成人の日
    expect(isJapaneseHoliday('2026-11-24')).toBe(false);
  });

  it('土日はグレー、祝日は「休」、平日は稼働日', () => {
    expect(calendar.dayKind('2026-11-20')).toBe('work'); // 金
    expect(calendar.dayKind('2026-11-21')).toBe('weekend'); // 土
    expect(calendar.dayKind('2026-11-22')).toBe('weekend'); // 日
    expect(calendar.dayKind('2026-11-23')).toBe('off'); // 祝日（月）
  });

  it('休業日・有給も「休」になり、稼働日から外れる', () => {
    const withDayOff = new WorkCalendar([{ date: '2026-12-28', label: '年末休業' }]);
    expect(withDayOff.dayKind('2026-12-28')).toBe('off');
    expect(withDayOff.isWorkingDay('2026-12-28')).toBe(false);
    expect(calendar.isWorkingDay('2026-12-28')).toBe(true);
  });

  it('営業日は「前の日付の翌日〜後の日付」の稼働日を数える（TC-04）', () => {
    // 12/26〜1/4 の稼働日：12/28, 29, 30, 31, 1/4
    expect(calendar.countWorkingDays('2026-12-25', '2027-01-04')).toBe(5);
    // 11/20〜12/25 の稼働日（今日 11/19 は数えない）
    expect(calendar.countWorkingDays('2026-11-19', '2026-12-25')).toBe(25);
    // 同じ日や逆向きなら 0
    expect(calendar.countWorkingDays('2026-12-25', '2026-12-25')).toBe(0);
    expect(calendar.countWorkingDays('2026-12-28', '2026-12-25')).toBe(0);
  });
});

describe('稼働日の番号（test-cases.md 0.1）', () => {
  /** test-cases.md 0.1 の表。開始日 2026-11-16 から数えた番号と日付 */
  const TABLE: [number, string][] = [
    [0, '2026-11-16'],
    [4, '2026-11-20'],
    [5, '2026-11-24'], // 11/23 は祝日
    [9, '2026-11-30'],
    [10, '2026-12-01'],
    [18, '2026-12-11'],
    [28, '2026-12-25'],
    [29, '2026-12-28'],
    [32, '2026-12-31'],
    [33, '2027-01-04'], // 1/1 は祝日
    [34, '2027-01-05'],
  ];

  it('番号から日付を出せる', () => {
    const numbering = new WorkdayNumbering(new WorkCalendar([]), '2026-11-16');
    for (const [index, date] of TABLE) {
      expect(numbering.dateOf(index)).toBe(date);
    }
  });

  it('日付から番号を出せる。稼働日でない日と開始日より前は null', () => {
    const numbering = new WorkdayNumbering(new WorkCalendar([]), '2026-11-16');
    for (const [index, date] of TABLE) {
      expect(numbering.indexOf(date)).toBe(index);
    }
    expect(numbering.indexOf('2026-11-23')).toBeNull(); // 祝日
    expect(numbering.indexOf('2026-11-21')).toBeNull(); // 土曜
    expect(numbering.indexOf('2026-11-13')).toBeNull(); // 開始日より前
  });

  it('開始日が休日なら、最初の稼働日が 0 番になる（TC-14）', () => {
    const numbering = new WorkdayNumbering(new WorkCalendar([]), '2026-11-21');
    expect(numbering.dateOf(0)).toBe('2026-11-24');
  });

  it('休業日を飛ばして番号を振る（TC-15）', () => {
    const numbering = new WorkdayNumbering(
      new WorkCalendar([{ date: '2026-12-28', label: '年末休業' }]),
      '2026-12-24',
    );
    expect(numbering.dateOf(0)).toBe('2026-12-24');
    expect(numbering.dateOf(1)).toBe('2026-12-25');
    expect(numbering.dateOf(2)).toBe('2026-12-29');
  });
});

describe('日付の小さな計算（sample.ts・storage.ts でも使う）', () => {
  it('daysBetween：暦の上の日数の差', () => {
    expect(daysBetween('2026-11-16', '2026-11-23')).toBe(7);
    expect(daysBetween('2026-11-23', '2026-11-16')).toBe(-7);
    expect(daysBetween('2026-12-31', '2027-01-01')).toBe(1);
  });

  it('mondayOfWeek：その日を含む週の月曜', () => {
    expect(mondayOfWeek('2026-11-16')).toBe('2026-11-16'); // 月曜はその日
    expect(mondayOfWeek('2026-11-19')).toBe('2026-11-16'); // 木曜
    expect(mondayOfWeek('2026-11-22')).toBe('2026-11-16'); // 日曜は前の週の続き
  });

  it('isValidDateString：形と、実在する日付か', () => {
    expect(isValidDateString('2026-11-23')).toBe(true);
    expect(isValidDateString('2028-02-29')).toBe(true); // うるう年
    expect(isValidDateString('2026-02-29')).toBe(false);
    expect(isValidDateString('2026-13-01')).toBe(false);
    expect(isValidDateString('2026-1-5')).toBe(false);
    expect(isValidDateString(20261123)).toBe(false);
  });
});
