/**
 * ヘッダ（tasks.md 4-1、SPEC 3.1「上部」）
 *
 * 左にアプリ名と、PJT名・開始日・エンド日の欄。右に 休業日・有給／バックアップ／Excel出力 のボタン。
 *
 * この段階では表示だけを行う。
 * - 欄は読み取り専用（readOnly）にしておき、段階5（5-2）で入力できるようにする
 * - ボタンはまだ何もしない。中身は段階8（休業日・バックアップ）と段階9B（Excel出力）で作る
 */

import { selectActiveProject } from '../store/appStore';
import { useAppStore } from '../store';
import controls from './controls.module.css';
import styles from './ProjectHeader.module.css';

export function ProjectHeader() {
  const project = useAppStore(selectActiveProject);

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
      <button type="button" className={controls.primary}>
        Excel出力
      </button>
    </header>
  );
}
