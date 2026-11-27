/**
 * バックアップの書き出しと読み込み（tasks.md 8-3、SPEC 3.1、決定事項18・82・83、architecture.md 7章）
 *
 * 対象は、全PJTと休業日・有給の一覧（アプリのデータ全体）。
 * ファイルの中身は localStorage に保存しているのと同じ形（SavedAppData）の JSON にする。
 * 形の変換と検証は core/storage.ts の toSaved・fromSaved だけで行い、ここでは JSON の文字との間をつなぐ。
 *
 * ■ 書き出し
 * データ → toSaved → JSON の文字 → Blob → ダウンロード（ui/download.ts）
 *
 * ■ 読み込み
 * ファイルの文字 → JSON として読む → fromSaved で形を確かめる → 正しければデータ
 * 壊れていれば、画面にそのまま出せる理由を返す。画面では、理由を知らせに出して、データは変えない（決定事項83）。
 *
 * DOM を使わない（File・Blob は呼ぶ側で扱う）ので、Vitest で確かめられる（tests/ui/backup.test.ts）。
 */

import { fromSaved, toSaved, type LoadResult } from '../core/storage';
import type { AppData, DateString } from '../core/types';

/**
 * 書き出すファイルの名前（決定事項82）。例：`工数ガント_バックアップ_2026-11-28.json`
 * @param exportDate 書き出した日（'YYYY-MM-DD'）。テストで日付を固定できるよう、引数で受け取る
 */
export function backupFileName(exportDate: DateString): string {
  return `工数ガント_バックアップ_${exportDate}.json`;
}

/**
 * データを、バックアップファイルの中身（JSON の文字）にする。
 * 人が開いても読めるよう、2文字の字下げを付けて書く（ファイルは少し大きくなるが、数十KB 程度）。
 */
export function backupText(data: AppData): string {
  return JSON.stringify(toSaved(data), null, 2);
}

/**
 * バックアップファイルの中身（文字）を読み、アプリのデータにする。
 * 読めなければ { ok: false, reason } を返す。reason はそのまま画面に出せる日本語。
 */
export function parseBackupText(text: string): LoadResult {
  let saved: unknown;
  try {
    saved = JSON.parse(text);
  } catch {
    // JSON.parse は、JSON の文法として正しくないと例外を投げる（別の種類のファイルを選んだときなど）
    return { ok: false, reason: 'JSON のファイルとして読めません' };
  }
  return fromSaved(saved);
}

/** 読み込めなかったときの知らせの文（理由を後ろに付ける） */
export function importErrorMessage(reason: string): string {
  return `バックアップを読み込めませんでした（${reason}）。データは変えていません。`;
}

/**
 * 上書きの確認に出す説明（決定事項83）。件数は、読み込むファイルの中身のもの。
 * 例：「今の全PJTと休業日・有給が、ファイルの内容（PJT 3件、休業日・有給 5件）に置き換わります。」
 */
export function importConfirmMessages(data: AppData): string[] {
  return [
    `今の全PJTと休業日・有給が、ファイルの内容（PJT ${data.projects.length}件、休業日・有給 ${data.daysOff.length}件）に置き換わります。`,
    '元に戻す（Ctrl+Z）で、読み込む前に戻せます。',
  ];
}
