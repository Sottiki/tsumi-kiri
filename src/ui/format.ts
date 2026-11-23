/**
 * 画面に出す数値・日付の書式（DESIGN.md の Voice & Content Strategy）
 *
 * core はデータを整数（工数は 0.1人日単位、進捗率は 0〜100）で持つ。
 * 画面に出すときだけ、人が読む形（「3.5」「60%」「12/25」）に直す。
 * 書式をここに集めておくと、表・カード・詳細パネルで書き方がばらつかない。
 */

import { displayProgressPct } from '../core/schedule';
import type { ScheduleRow } from '../core/types';

/**
 * 0.1人日単位の整数を、小数1桁の人日にする（35 → '3.5'、20 → '2.0'）。
 *
 * 10 で割ってから toFixed(1) で小数1桁にそろえる。
 * 元が整数なので、10 で割った値は小数1桁で必ず正しく丸められる（0.1 の足し算のような誤差は出ない）。
 */
export function formatTenths(tenths: number): string {
  return (tenths / 10).toFixed(1);
}

/**
 * 行の進捗率を、画面に出す整数%の数字にする（'%' は付けない）。
 *
 * - 末端：入力した整数をそのまま出す
 * - 親・工程：子の平均で小数なので、displayProgressPct で丸める。
 *   100%未満は最大 99%、0%より大きければ最小 1% にする（SPEC 4章）
 */
export function rowProgressPct(row: ScheduleRow): number {
  return row.leaf ? row.progressPct : displayProgressPct(row.progressPct);
}
