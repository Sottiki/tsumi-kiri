/**
 * ui/parse.ts のテスト（tasks.md 5-1・5-2：入力欄の文字の読み取り。SPEC 3.1、決定事項54・57・58）
 */
import { describe, expect, it } from 'vitest';
import {
  parseDateInput,
  parseEffortInput,
  parseProgressInput,
  parseProjectName,
} from '../../src/ui/parse';

describe('工数の入力（0 以上・小数1桁まで）', () => {
  it('人日を 0.1人日単位の整数にする', () => {
    expect(parseEffortInput('3.5')).toBe(35);
    expect(parseEffortInput('2')).toBe(20);
    expect(parseEffortInput('0')).toBe(0);
    expect(parseEffortInput('0.1')).toBe(1);
    expect(parseEffortInput('12.3')).toBe(123);
  });

  it('結果はちょうどの整数になる（丸めずに、整数部と小数部を整数のまま足すので）', () => {
    expect(parseEffortInput('0.3')).toBe(3);
    expect(parseEffortInput('1.1')).toBe(11);
  });

  it('全角の数字と、前後の空白を受ける', () => {
    expect(parseEffortInput('３．５')).toBe(35);
    expect(parseEffortInput(' 2.0 ')).toBe(20);
  });

  it('打っている途中の形や、正しくない値は null（反映しない）', () => {
    expect(parseEffortInput('')).toBeNull();
    expect(parseEffortInput('3.')).toBeNull(); // 打っている途中
    expect(parseEffortInput('.5')).toBeNull();
    expect(parseEffortInput('1.25')).toBeNull(); // 小数2桁
    expect(parseEffortInput('-1')).toBeNull(); // 負の数
    expect(parseEffortInput('abc')).toBeNull();
    expect(parseEffortInput('1e3')).toBeNull();
  });
});

describe('進捗率の入力（0〜100 の整数）', () => {
  it('0〜100 の整数を受ける', () => {
    expect(parseProgressInput('0')).toBe(0);
    expect(parseProgressInput('60')).toBe(60);
    expect(parseProgressInput('100')).toBe(100);
    expect(parseProgressInput('６０')).toBe(60); // 全角
  });

  it('範囲の外や、整数でない値は null', () => {
    expect(parseProgressInput('')).toBeNull();
    expect(parseProgressInput('101')).toBeNull();
    expect(parseProgressInput('120')).toBeNull();
    expect(parseProgressInput('60.5')).toBeNull();
    expect(parseProgressInput('-5')).toBeNull();
    expect(parseProgressInput('1000')).toBeNull();
  });
});

describe('開始日・エンド日の入力（2026〜2050年）', () => {
  it('範囲の中の正しい日付は、そのまま返す', () => {
    expect(parseDateInput('2026-01-01')).toBe('2026-01-01');
    expect(parseDateInput('2026-12-25')).toBe('2026-12-25');
    expect(parseDateInput('2050-12-31')).toBe('2050-12-31');
  });

  it('年を打っている途中の値（Chrome の日付の欄が出すもの）は null', () => {
    // 「2027」と打つと、0002 → 0020 → 0202 → 2027 の順に値が来る
    expect(parseDateInput('0002-12-25')).toBeNull();
    expect(parseDateInput('0020-12-25')).toBeNull();
    expect(parseDateInput('0202-12-25')).toBeNull();
    expect(parseDateInput('2027-12-25')).toBe('2027-12-25');
  });

  it('範囲の外の年、正しくない日付、空は null', () => {
    expect(parseDateInput('2025-12-31')).toBeNull();
    expect(parseDateInput('2051-01-01')).toBeNull();
    expect(parseDateInput('2026-02-30')).toBeNull();
    expect(parseDateInput('')).toBeNull();
  });
});

describe('PJT名の入力', () => {
  it('空でなければ、打ったとおりに返す', () => {
    expect(parseProjectName('新しいPJT')).toBe('新しいPJT');
    expect(parseProjectName(' 前後に空白 ')).toBe(' 前後に空白 ');
  });

  it('空や、空白だけなら null', () => {
    expect(parseProjectName('')).toBeNull();
    expect(parseProjectName('   ')).toBeNull();
    expect(parseProjectName('　')).toBeNull(); // 全角の空白
  });
});
