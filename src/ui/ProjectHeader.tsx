/**
 * ヘッダ（tasks.md 4-1、SPEC 3.1「上部」）
 *
 * 左にアプリ名と、PJT名・開始日・エンド日の欄。右に 休業日・有給／バックアップ／Excel出力 のボタン。
 *
 * ■ 欄（5-2）
 * 打つたびに、正しい値ならストアの updateProject で反映する（日程とカードがすぐに変わる）。
 * 正しくない値は反映せず、欄を離れたら今の値に戻す（DraftInput の動き）。
 * - PJT名：空（空白だけ）は反映しない（決定事項59）
 * - 開始日：2026〜2050年の日付だけ反映する。空にはできない（日程を積む起点なので）
 * - エンド日：2026〜2050年の日付か、空欄（エンド日未設定、SPEC 3.1）を反映する（決定事項60）
 * 欄に入ってから離れるまでの入力は、元に戻すの履歴で1件にまとまる（決定事項61。store/history.ts）。
 *
 * ■ ボタン
 * - 「Excel出力」は表示中のPJTを .xlsx でダウンロードする（段階9B）
 * - 「休業日・有給」「バックアップ」はまだ何もしない。中身は段階8で作る
 */

import { useRef } from 'react';
import { activeProject } from '../core/appData';
import { createExcelFile } from '../excel/exportFile';
import { localToday, selectActiveProject } from '../store/appStore';
import { appStore, useAppStore } from '../store';
import controls from './controls.module.css';
import { downloadBlob } from './download';
import { DraftInput } from './DraftInput';
import { MAX_INPUT_YEAR, MIN_INPUT_YEAR, parseDateInput, parseProjectName } from './parse';
import styles from './ProjectHeader.module.css';

/**
 * Excel出力に失敗したときの知らせ。
 * 今はブラウザの alert で出す。段階8で、ストアの知らせ（notice）に移す（2026-11-23 決定、tasks.md 8-4）
 */
const EXPORT_ERROR_MESSAGE =
  'Excel のファイルを作れませんでした。もう一度「Excel出力」を押してください。';

/** 日付の欄のカレンダーで選べる範囲（決定事項60）。打って入れた値は parseDateInput で確かめる */
const DATE_MIN = `${MIN_INPUT_YEAR}-01-01`;
const DATE_MAX = `${MAX_INPUT_YEAR}-12-31`;

export function ProjectHeader() {
  const project = useAppStore(selectActiveProject);
  const updateProject = useAppStore((state) => state.actions.updateProject);

  // 欄に打った文字を反映する。反映したら新しい値を欄に出す形で返し、反映しなければ null を返す
  // （DraftInput の決まり）。editSession は、欄に入ってから離れるまでを元に戻すの1件にまとめる目印
  const handleName = (text: string, editSession: string): string | null => {
    const name = parseProjectName(text);
    if (name === null || name === project.name) return null;
    updateProject({ name }, editSession);
    return name;
  };

  const handleStart = (text: string, editSession: string): string | null => {
    const start = parseDateInput(text);
    if (start === null || start === project.start) return null;
    updateProject({ start }, editSession);
    return start;
  };

  const handleEnd = (text: string, editSession: string): string | null => {
    // 欄を空にしたら、エンド日を空欄（null）にする。それ以外は、正しい日付のときだけ反映する
    const end = text === '' ? null : parseDateInput(text);
    if (text !== '' && end === null) return null;
    if (end === project.end) return null;
    updateProject({ end }, editSession);
    return end ?? ''; // 空欄は、欄では '' で出す
  };

  /**
   * Excel を作っている間は true。作り終わる前にもう一度押されても、2つ目を作らないための目印。
   * 画面の見た目は変えないので、描き直しの要らない useRef に持つ（useState だと描き直しが起きる）
   */
  const exportingRef = useRef(false);

  /** 「Excel出力」を押したとき：表示中のPJTを Excel のファイルにして、ダウンロードさせる */
  async function handleExportExcel() {
    if (exportingRef.current) return;
    exportingRef.current = true;
    try {
      // 押した瞬間のデータを、ストアから直接読む。
      // 描くときに読んだ値（project）を使ってもよいが、休業日（daysOff）は画面のこの部品では使わないので、
      // そのために購読して描き直しを増やすより、押したときにだけ読むほうが素直
      const { data } = appStore.getState();
      const today = localToday();
      const file = await createExcelFile(activeProject(data), data.daysOff, today);
      downloadBlob(file.blob, file.fileName);
    } catch (error) {
      console.error(error);
      window.alert(EXPORT_ERROR_MESSAGE);
    } finally {
      exportingRef.current = false;
    }
  }

  return (
    <header className={styles.header}>
      <h1 className={styles.title}>工数ガント</h1>

      <label className={controls.field}>
        PJT名
        <DraftInput className={styles.nameInput} value={project.name} onDraft={handleName} />
      </label>
      <label className={controls.field}>
        開始日
        <DraftInput
          className={controls.input}
          type="date"
          min={DATE_MIN}
          max={DATE_MAX}
          value={project.start}
          onDraft={handleStart}
        />
      </label>
      <label className={controls.field}>
        エンド日
        {/* エンド日が空欄（null）なら、空の欄にする。input の value に null は渡せないので '' にする */}
        <DraftInput
          className={controls.input}
          type="date"
          min={DATE_MIN}
          max={DATE_MAX}
          value={project.end ?? ''}
          onDraft={handleEnd}
        />
      </label>

      {/* ここから右はボタン。空きを広げて右へ寄せる */}
      <div className={styles.spacer} />
      {/* 「休業日・有給」は画面案にないボタン。「バックアップ」と同じ形で左に置く */}
      <button type="button" className={controls.secondary}>
        休業日・有給
      </button>
      <button type="button" className={controls.secondary}>
        バックアップ
      </button>
      {/* onClick は Promise を返す関数を受け取らないので、void で「待たない」と書いて呼ぶ */}
      <button type="button" className={controls.primary} onClick={() => void handleExportExcel()}>
        Excel出力
      </button>
    </header>
  );
}
