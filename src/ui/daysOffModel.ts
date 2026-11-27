/**
 * 休業日・有給のダイアログの決まり（tasks.md 8-2、SPEC 3.1、決定事項17・81）
 *
 * ダイアログ（ui/DaysOffDialog.tsx）の欄に入れた値から、何日を足すかを決める。
 * React にも DOM にも依存しない関数にして、Vitest で確かめられるようにする（tests/ui/daysOffModel.test.ts）。
 *
 * ■ 足す日（決定事項81）
 * 期間でも1日でも、平日（土日・日本の祝日でない日）だけを足す。
 * 土日・祝日はもともと休みなので、足しても日程は変わらず、一覧が見にくくなるだけのため。
 * 例：12/29〜1/3 なら 12/29・12/30・12/31 の3日（1/1 は元日、1/2・1/3 は土日）。
 *
 * すでに休業日として入っている平日も、足す日に入れる（名前を新しいものに置き換えるため。core の addDaysOff）。
 */

import {
  addDays,
  daysBetween,
  formatMonthDayWeekday,
  isJapaneseHoliday,
  isWeekend,
} from '../core/calendar';
import type { DateString, DayOff } from '../core/types';
import { MAX_INPUT_YEAR, MIN_INPUT_YEAR, parseDateInput } from './parse';

/** 期間の長さの上限（日数）。1年（うるう年でも収まるよう 366日）まで（決定事項81） */
export const MAX_RANGE_DAYS = 366;

/** ダイアログの欄に入れた値（どれも欄に入っている文字のまま） */
export interface DaysOffInput {
  /** 開始日（1日だけ足すときは、その日） */
  start: string;
  /** 終了日。空なら、開始日の1日だけ */
  end: string;
  /** 名前（例「年末休業」「有給」）。空でもよい */
  label: string;
}

/**
 * 足す日を決めた結果。
 * - ok：足す日（日付の順）と、土日・祝日のために足さなかった日数
 * - ok でない：足さない理由（そのまま画面に出せる文）
 */
export type DaysOffPlan =
  { ok: true; days: DayOff[]; skipped: number } | { ok: false; message: string };

/** 日付の欄に入れられる年の範囲の説明（ほかの欄と同じ 2026〜2050年。決定事項60） */
const YEAR_RANGE_TEXT = `${MIN_INPUT_YEAR}〜${MAX_INPUT_YEAR}年`;

/**
 * 欄の値から、足す日を決める。
 *
 * 確かめる順：
 * 1. 開始日が正しい日付（2026〜2050年）か
 * 2. 終了日が空か、正しい日付で、開始日と同じか後か
 * 3. 期間が 366日以内か
 * 4. 期間の中に平日があるか
 */
export function planDaysOff(input: DaysOffInput): DaysOffPlan {
  const start = parseDateInput(input.start);
  if (start === null) {
    return { ok: false, message: `開始日を ${YEAR_RANGE_TEXT}の日付で入れてください。` };
  }

  // 終了日が空なら、開始日の1日だけ
  const end = input.end === '' ? start : parseDateInput(input.end);
  if (end === null) {
    return { ok: false, message: `終了日を ${YEAR_RANGE_TEXT}の日付で入れてください。` };
  }
  if (end < start) {
    // 'YYYY-MM-DD' は文字列のまま比べても日付の順になる
    return { ok: false, message: '終了日は、開始日と同じ日か後にしてください。' };
  }

  // 開始日と終了日を両方含めた日数
  const length = daysBetween(start, end) + 1;
  if (length > MAX_RANGE_DAYS) {
    return { ok: false, message: `期間は ${MAX_RANGE_DAYS}日（1年）までにしてください。` };
  }

  // 名前の前後の空白は取り除く（空白だけなら、名前なしと同じ）
  const label = input.label.trim();
  const days: DayOff[] = [];
  let skipped = 0;
  for (let offset = 0; offset < length; offset += 1) {
    const date = addDays(start, offset);
    if (isWeekend(date) || isJapaneseHoliday(date)) {
      skipped += 1;
    } else {
      days.push({ date, label });
    }
  }

  if (days.length === 0) {
    const message =
      length === 1
        ? `${formatMonthDayWeekday(start)} は土日・祝日のため、もともと休みです。足す必要はありません。`
        : '期間の中に平日がありません。土日・祝日は、もともと休みです。';
    return { ok: false, message };
  }
  return { ok: true, days, skipped };
}

/**
 * 足した後に、ダイアログに出す文。
 * 土日・祝日を飛ばしたときは、そのことも書く（一覧に出てこない日がある理由を伝えるため）。
 */
export function addedMessage(plan: { days: readonly DayOff[]; skipped: number }): string {
  const added = `${plan.days.length}日を足しました。`;
  if (plan.skipped === 0) return added;
  return `${added}土日・祝日の${plan.skipped}日は、もともと休みのため足していません。`;
}

/** 一覧の1年ぶん */
export interface DaysOffYear {
  year: number;
  days: DayOff[];
}

/**
 * 一覧を、年ごとにまとめる。一覧の日付は「12/29(火)」の形（DESIGN.md の Voice）で年を書かないので、
 * 年をまたぐ休み（12/29〜1/3 など）でも分かるよう、年の見出しを付けるため。
 *
 * @param daysOff 日付の順に並んだ一覧（core の addDaysOff が並べ直している）
 */
export function groupByYear(daysOff: readonly DayOff[]): DaysOffYear[] {
  const groups: DaysOffYear[] = [];
  for (const day of daysOff) {
    const year = Number(day.date.slice(0, 4));
    const last = groups[groups.length - 1];
    if (last !== undefined && last.year === year) {
      last.days.push(day);
    } else {
      groups.push({ year, days: [day] });
    }
  }
  return groups;
}

/** 一覧に出す日付（例：'12/29(火)'） */
export function dayOffDateLabel(date: DateString): string {
  return formatMonthDayWeekday(date);
}
