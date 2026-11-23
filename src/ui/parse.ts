/**
 * 入力欄の文字を、データの値に読み取る（tasks.md 5-1・5-2、SPEC 3.1「操作」）
 *
 * format.ts の逆向き。画面の入力欄に打った文字（「3.5」「60」）を、core が持つ整数（35、60）にする。
 *
 * ■ 決まり（SPEC 3.1、決定事項56・59）
 * 正しい値のときだけ読み取り、それ以外は null を返す。null のときは反映しない。
 * - 工数：0 以上で、小数1桁まで（「3」「3.5」）。「3.」「.5」「1.25」「-1」は受けない
 * - 進捗率：0〜100 の整数（「0」「60」「100」）。「60.5」「120」は受けない
 * - PJT名：空（空白だけを含む）は受けない
 * - 開始日・エンド日：2026〜2050年の正しい日付だけ（決定事項60）
 *
 * 打っている途中の「3.」も null になるので、そこでは反映せず、続けて「5」を打ったときに反映する。
 *
 * React にも DOM にも依存しないので、Vitest でそのまま確かめられる（tests/ui/parse.test.ts）。
 */

import { isValidDateString } from '../core/calendar';
import type { DateString } from '../core/types';

/**
 * 全角の数字・記号を半角にし、前後の空白を取り除く。
 *
 * 日本語入力のまま「３．５」と打っても受けられるようにする。
 * NFKC は、全角の「３」「．」を半角の「3」「.」に直す Unicode の正規化。
 */
function normalizeNumberText(text: string): string {
  return text.normalize('NFKC').trim();
}

/** 工数の形：整数部が1桁以上、続けて「.数字1つ」があってもよい */
const EFFORT_PATTERN = /^(\d+)(?:\.(\d))?$/;

/** 進捗率の形：数字だけで1〜3桁 */
const PROGRESS_PATTERN = /^\d{1,3}$/;

/**
 * 工数の入力（人日）を、0.1人日単位の整数にする（「3.5」→ 35、「2」→ 20）。正しくなければ null。
 *
 * 小数を経由する `Number('3.5') * 10` でも、ふつうは正しい整数になる。
 * ただ、2進数の小数（architecture.md 5章）の誤差を考えずに済むよう、
 * 整数部と小数部を文字のまま分けて、それぞれを整数として足す。
 */
export function parseEffortInput(text: string): number | null {
  const match = EFFORT_PATTERN.exec(normalizeNumberText(text));
  if (match === null) return null;
  const wholeDays = Number(match[1]); // 整数部（「3.5」の 3）
  const tenths = match[2] === undefined ? 0 : Number(match[2]); // 小数部（「3.5」の 5）
  return wholeDays * 10 + tenths;
}

/** 進捗率の入力（%）を、0〜100 の整数にする（「60」→ 60）。正しくなければ null */
export function parseProgressInput(text: string): number | null {
  const normalized = normalizeNumberText(text);
  if (!PROGRESS_PATTERN.test(normalized)) return null;
  const pct = Number(normalized);
  return pct <= 100 ? pct : null;
}

/** 開始日・エンド日に受ける年の範囲（決定事項60）。上限の 2050年は、同梱の祝日データの終わり */
export const MIN_INPUT_YEAR = 2026;
export const MAX_INPUT_YEAR = 2050;

/**
 * 日付の欄（<input type="date">）の値を読み取る。2026〜2050年の正しい日付なら、そのまま返す。
 *
 * Chrome の日付の欄は、年を「2027」と打つ途中で「0002-12-25」「0020-12-25」「0202-12-25」と
 * 値を出してくる。これを反映すると、2年からの日程を組んで画面が固まるので、年の範囲で受けない。
 *
 * - 空（''）は null。エンド日を空欄にしたいときは、呼ぶ側で '' を見て null を入れる
 * - 日付として正しいか（2月30日などでないか）は、core の isValidDateString で確かめる
 */
export function parseDateInput(text: string): DateString | null {
  if (!isValidDateString(text)) return null;
  const year = Number(text.slice(0, 4));
  return year >= MIN_INPUT_YEAR && year <= MAX_INPUT_YEAR ? text : null;
}

/**
 * PJT名の入力。空（空白だけを含む）なら null（決定事項59）。
 * 空でなければ、打ったとおりの文字を返す（前後の空白も、打った人の意図として残す）。
 */
export function parseProjectName(text: string): string | null {
  return text.trim() === '' ? null : text;
}
