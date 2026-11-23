/**
 * 稼働日の暦（tasks.md 1-3、SPEC 5章）
 *
 * ここでは「どの日が働く日か」と「開始日から数えて何番目の稼働日か」を扱う。
 * 日程の計算（schedule.ts）は、日付ではなく稼働日の番号（0, 1, 2…）の上でタスクを積み、
 * 最後にこのファイルの関数で番号を日付に戻す。
 *
 * ■ 日付の扱い
 * 日付は 'YYYY-MM-DD' の文字列（DateString）のまま持ち歩く。
 * 曜日を知りたいときや1日足したいときだけ、その場で Date を作って使い捨てにする。
 * そのときは必ず UTC（協定世界時）の関数（Date.UTC・getUTCDay など）を使う。
 * ローカル時刻の関数（new Date('2026-11-23') の getDay など）を使うと、
 * 動かす PC のタイムゾーンや夏時間によって、日付が1日ずれることがあるため。
 *
 * ■ 日付の大小
 * 'YYYY-MM-DD' の文字列は、桁数がそろっているので、文字列のまま比べても日付の順になる
 * （'2026-11-30' < '2026-12-01'）。このファイルと schedule.ts では、日付を文字列のまま比べる。
 */

import holiday_jp from '@holiday-jp/holiday_jp';
import type { DateString, DayOff } from './types';

// ---------------------------------------------------------------------------
// 日付の文字列の計算
// ---------------------------------------------------------------------------

/** 1日のミリ秒。UTC には夏時間がないので、どの日も必ずこの長さになる */
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** 曜日の表示。getUTCDay() の値（日曜 = 0 … 土曜 = 6）の順に並べる */
const WEEKDAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'] as const;

/**
 * 'YYYY-MM-DD' を、UTC のその日の 0 時を表すミリ秒に変える。
 * 文字列を数字に分けて Date.UTC に渡すので、タイムゾーンの影響を受けない。
 */
function toUtcMs(date: DateString): number {
  const [year, month, day] = date.split('-').map(Number);
  if (year === undefined || month === undefined || day === undefined) {
    throw new Error(`日付の形式が正しくありません: ${date}`);
  }
  // Date.UTC の月は 0 始まり（1月 = 0）なので、1 を引く
  return Date.UTC(year, month - 1, day);
}

/** UTC のミリ秒を 'YYYY-MM-DD' に戻す（toUtcMs の逆） */
function fromUtcMs(ms: number): DateString {
  const d = new Date(ms);
  const year = String(d.getUTCFullYear());
  // 月・日は2桁にそろえる（'2026-1-5' ではなく '2026-01-05'）。そろえないと文字列の比較が日付の順にならない
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** 日付に days 日を足す（マイナスなら引く）。稼働日かどうかは関係なく、暦の上で数える */
export function addDays(date: DateString, days: number): DateString {
  return fromUtcMs(toUtcMs(date) + days * MS_PER_DAY);
}

/** 曜日の番号（日曜 = 0、月曜 = 1 … 土曜 = 6） */
export function dayOfWeek(date: DateString): number {
  return new Date(toUtcMs(date)).getUTCDay();
}

/** 土曜か日曜か */
export function isWeekend(date: DateString): boolean {
  const dow = dayOfWeek(date);
  return dow === 0 || dow === 6;
}

/**
 * 日本の祝日か（振替休日・国民の休日を含む）。
 * データは @holiday-jp/holiday_jp に同梱されたもので、2050年まで入っている。
 * isHoliday は 'YYYY-MM-DD' の文字列をそのまま受け取れるので、Date を作らずに渡す。
 */
export function isJapaneseHoliday(date: DateString): boolean {
  return holiday_jp.isHoliday(date);
}

/** 'M/D' 形式（例：'12/25'）。警告文の期日・エンド日に使う */
export function formatMonthDay(date: DateString): string {
  const d = new Date(toUtcMs(date));
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
}

/** 'M/D(曜)' 形式（例：'12/25(金)'）。警告文の終了予定などに使う */
export function formatMonthDayWeekday(date: DateString): string {
  const label = WEEKDAY_LABELS[dayOfWeek(date)];
  return `${formatMonthDay(date)}(${label})`;
}

// ---------------------------------------------------------------------------
// 稼働日の判定
// ---------------------------------------------------------------------------

/**
 * ガントの見出しでの日の種類（SPEC 3.1）。
 * - 'work'    ：稼働日
 * - 'weekend' ：土日（グレー。日付はそのまま出す）
 * - 'off'     ：祝日・休業日・有給（グレー。日付の代わりに「休」と出す）
 *
 * 土日と祝日が重なった日（土曜の祝日など）や、土日に入れた休業日は 'off' にする。
 * 「休」と出したほうが、その日が祝日・休業日だと分かるため。
 */
export type DayKind = 'work' | 'weekend' | 'off';

/**
 * 稼働日の暦。休業日・有給の一覧（全PJT共通）を受け取り、どの日が稼働日かを答える。
 * 土日と日本の祝日は、一覧に入れなくても自動で稼働日から外す。
 */
export class WorkCalendar {
  /** 休業日・有給の日付。何度も「この日は休みか」を調べるので、探すのが速い Set にしておく */
  private readonly daysOff: Set<DateString>;

  constructor(daysOff: readonly DayOff[]) {
    this.daysOff = new Set(daysOff.map((dayOff) => dayOff.date));
  }

  /** 日の種類（ガントの見出し用） */
  dayKind(date: DateString): DayKind {
    if (isJapaneseHoliday(date) || this.daysOff.has(date)) {
      return 'off';
    }
    if (isWeekend(date)) {
      return 'weekend';
    }
    return 'work';
  }

  /** 稼働日か（土日・祝日・休業日のどれでもない日） */
  isWorkingDay(date: DateString): boolean {
    return this.dayKind(date) === 'work';
  }

  /**
   * after の翌日から until まで（until を含む）の稼働日を数える。
   * until が after と同じか前なら 0。
   *
   * 例：after = 12/25、until = 1/4 なら、12/26〜1/4 の稼働日（12/28, 29, 30, 31, 1/4）で 5。
   * 「エンド日を ○ 営業日超過」「エンド日まで ○ 営業日」「○ 営業日短縮」は、どれもこの数え方にする（test-cases.md TC-04）。
   *
   * 1日ずつ見ていく素直な方法で数える。PJTの期間は長くても数か月なので、これで十分に速い。
   */
  countWorkingDays(after: DateString, until: DateString): number {
    let count = 0;
    for (let date = addDays(after, 1); date <= until; date = addDays(date, 1)) {
      if (this.isWorkingDay(date)) {
        count += 1;
      }
    }
    return count;
  }
}

// ---------------------------------------------------------------------------
// 稼働日の番号
// ---------------------------------------------------------------------------

/**
 * PJTの開始日から数えた稼働日の番号。番号と日付を行き来できる。
 *
 * 開始日（休日なら、その後の最初の稼働日）が 0 番、次の稼働日が 1 番…となる。
 * 例（test-cases.md 0.1）：開始日 2026-11-16 なら、0 = 11/16、4 = 11/20、5 = 11/24（11/23 は祝日）。
 *
 * どこまで番号が必要かは、タスクの量で変わる。そこで最初から全部は作らず、
 * 大きな番号を聞かれたときに、そこまで表を伸ばす（一度作った分は覚えておく）。
 */
export class WorkdayNumbering {
  /** dates[i] が i 番目の稼働日 */
  private readonly dates: DateString[] = [];
  /** 日付から番号を引くための表。dates と同じ中身を逆向きに持つ */
  private readonly indexByDate = new Map<DateString, number>();
  /** 次に調べる日付。表を伸ばすときは、ここから1日ずつ進める */
  private nextDate: DateString;

  constructor(
    private readonly calendar: WorkCalendar,
    start: DateString,
  ) {
    this.nextDate = start;
  }

  /** 稼働日を1つ見つけて、表の末尾に足す */
  private extendByOne(): void {
    // 稼働日が見つかるまで1日ずつ進める（土日・祝日・休業日は飛ばす）
    while (!this.calendar.isWorkingDay(this.nextDate)) {
      this.nextDate = addDays(this.nextDate, 1);
    }
    this.indexByDate.set(this.nextDate, this.dates.length);
    this.dates.push(this.nextDate);
    this.nextDate = addDays(this.nextDate, 1);
  }

  /** index 番目の稼働日の日付 */
  dateOf(index: number): DateString {
    if (!Number.isInteger(index) || index < 0) {
      throw new Error(`稼働日の番号は 0 以上の整数です: ${index}`);
    }
    while (this.dates.length <= index) {
      this.extendByOne();
    }
    // 上の while で必ず index 番目まで作ってあるので、undefined にはならない
    return this.dates[index] as DateString;
  }

  /**
   * 日付が何番目の稼働日か。稼働日でない日や、開始日より前の日は null。
   * ガントで「この日のマスは何番の稼働日か」を調べるのに使う。
   */
  indexOf(date: DateString): number | null {
    // その日付まで表を伸ばしてから引く。最後に作った稼働日が date より前のあいだ、伸ばし続ける
    while (this.dates.length === 0 || (this.dates[this.dates.length - 1] as DateString) < date) {
      this.extendByOne();
    }
    return this.indexByDate.get(date) ?? null;
  }
}
