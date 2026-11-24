/**
 * 操作の列（tasks.md 4-3、SPEC 3.1）
 *
 * - 通常 8h ／ 残業 10h の切り替え：表示の切り替えなので、この段階から動かす。
 *   ストアの setOvertime は「元に戻す」の履歴に入れない（SPEC 3.1）
 * - ＋タスク追加（5-4）：開いているタスクと同じ工程の末尾（開いていなければ最初の工程の末尾）に足す。
 *   追加先の決め方はストアの addTask（core/tree.ts の phaseForNewTask）に任せる。
 *   足したタスクは「開いているタスク」になり、そのまま詳細パネルが開く（SPEC 3.1、panel/DetailPanel.tsx）
 * - 凡例：完了分、残り、エンド日超過、土日祝、今日、エンド日、期日超過の7つ（DESIGN.md の Components）
 */

import { useAppStore } from '../store';
import controls from './controls.module.css';
import { FireIcon } from './icons';
import styles from './Toolbar.module.css';

export function Toolbar() {
  const overtime = useAppStore((state) => state.computed.overtime);
  const setOvertime = useAppStore((state) => state.actions.setOvertime);
  const addTask = useAppStore((state) => state.actions.addTask);

  return (
    <section className={styles.toolbar}>
      {/* 2つのボタンのうち、選んでいる方を黒くする。aria-pressed で、読み上げでもどちらか分かるようにする */}
      <div className={styles.modeToggle} role="group" aria-label="表示モード">
        <button
          type="button"
          className={overtime ? styles.mode : styles.modeActive}
          aria-pressed={!overtime}
          onClick={() => setOvertime(false)}
        >
          通常 8h
        </button>
        <button
          type="button"
          className={overtime ? styles.modeActive : styles.mode}
          aria-pressed={overtime}
          onClick={() => setOvertime(true)}
        >
          残業 10h
        </button>
      </div>

      {/* addTask は足したタスクの id を返すが、ここでは使わないので、矢印関数で包んで捨てる */}
      <button type="button" className={controls.addTask} onClick={() => void addTask()}>
        ＋ タスク追加
      </button>

      <div className={styles.spacer} />

      <ul className={styles.legend} aria-label="凡例">
        <li className={styles.legendItem}>
          <span className={styles.swatchDone} aria-hidden="true" />
          完了分
        </li>
        <li className={styles.legendItem}>
          <span className={styles.swatchRest} aria-hidden="true" />
          残り
        </li>
        <li className={styles.legendItem}>
          <span className={styles.swatchOver} aria-hidden="true" />
          エンド日超過
        </li>
        <li className={styles.legendItem}>
          <span className={styles.swatchDayOff} aria-hidden="true" />
          土日祝
        </li>
        <li className={styles.legendItem}>
          <span className={styles.swatchToday} aria-hidden="true" />
          今日
        </li>
        <li className={styles.legendItem}>
          <span className={styles.swatchEndLine} aria-hidden="true" />
          エンド日
        </li>
        <li className={styles.legendItem}>
          <FireIcon className={styles.fire} size={13} decorative />
          期日超過
        </li>
      </ul>
    </section>
  );
}
