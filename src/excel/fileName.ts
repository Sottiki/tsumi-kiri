/**
 * Excel出力のファイル名（tasks.md 9-5、SPEC 3.3、architecture.md 9章）
 *
 * 形は `工数ガント_<PJT名>_<出力日>.xlsx`。例：`工数ガント_社内ポータル刷新_2026-11-23.xlsx`
 *
 * - 出力日は `2026-11-23` の形（アプリの入力欄や Excel のセルの日付と同じ形。2026-11-23 決定）
 * - PJT名にファイル名で使えない文字があれば `_` に置き換える（2026-11-23 決定）
 * - PJT名が空欄、または空白だけなら「無題」にする（2026-11-23 決定）
 *
 * DOM を使わない、ただの文字の組み立てなので、Vitest で確かめられる（tests/excel-file-name.test.ts）。
 */

import type { DateString } from '../core/types';

/** PJT名が空欄のときに、代わりに使う名前 */
export const UNTITLED_PROJECT_NAME = '無題';

/**
 * ファイル名で使えない文字。
 *
 * - `/ \ : * ? " < > |` は Windows でファイル名に使えない（`/` は Mac でも使えない。`:` は Mac の Finder でも避ける）
 * - `\u0000-\u001F` は改行やタブなどの、目に見えない制御文字。ファイル名に入ると壊れることがある
 *
 * 末尾の `g` は「見つかったものをすべて置き換える」という意味（g が無いと最初の1つだけになる）。
 */
// eslint-disable-next-line no-control-regex -- 制御文字を取り除くために、わざと書いている
const FORBIDDEN_CHARACTERS = /[/\\:*?"<>|\u0000-\u001F]/g;

/**
 * PJT名を、ファイル名に入れられる形にする。
 *
 * 例：'社内ポータル刷新' → '社内ポータル刷新'、'A/B案' → 'A_B案'、'  ' → '無題'
 */
export function fileSafeProjectName(projectName: string): string {
  // 前後の空白は、ファイル名にあると見分けにくいので取り除く（全角スペースも trim で取り除かれる）
  const trimmed = projectName.trim();
  if (trimmed === '') return UNTITLED_PROJECT_NAME;
  return trimmed.replace(FORBIDDEN_CHARACTERS, '_');
}

/**
 * Excel出力のファイル名を作る。
 *
 * @param projectName 表示中のPJTの名前
 * @param exportDate 出力日（'YYYY-MM-DD'）。テストで日付を固定できるよう、引数で受け取る
 */
export function excelFileName(projectName: string, exportDate: DateString): string {
  return `工数ガント_${fileSafeProjectName(projectName)}_${exportDate}.xlsx`;
}
