/**
 * ヘッダ（tasks.md 4-1、SPEC 3.1「上部」）
 *
 * 左にアプリ名と、PJT名・開始日・エンド日の欄。右に 休業日・有給／バックアップ／Excel出力 のボタン。
 *
 * - 欄は読み取り専用（readOnly）にしておき、段階5（5-2）で入力できるようにする
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
import styles from './ProjectHeader.module.css';

/**
 * Excel出力に失敗したときの知らせ。
 * 今はブラウザの alert で出す。段階8で、ストアの知らせ（notice）に移す（2026-11-23 決定、tasks.md 8-4）
 */
const EXPORT_ERROR_MESSAGE =
  'Excel のファイルを作れませんでした。もう一度「Excel出力」を押してください。';

export function ProjectHeader() {
  const project = useAppStore(selectActiveProject);

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
        <input className={styles.nameInput} value={project.name} readOnly />
      </label>
      <label className={controls.field}>
        開始日
        <input className={controls.input} type="date" value={project.start} readOnly />
      </label>
      <label className={controls.field}>
        エンド日
        {/* エンド日が空欄（null）なら、空の欄にする。input の value に null は渡せないので '' にする */}
        <input className={controls.input} type="date" value={project.end ?? ''} readOnly />
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
