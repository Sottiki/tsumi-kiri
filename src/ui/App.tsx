/**
 * 画面全体（architecture.md 8章、DESIGN.md の Layout）
 *
 * 上から：ヘッダ → 上部のカード4枚 → 操作の列 → タスク表とガント。
 * 画面の高さいっぱいを縦に並べ、タスク表とガント（Board）だけが残りの高さを使ってスクロールする。
 * こうすると、ヘッダやカードは上に見えたまま、表とガントだけを動かせる（SPEC 3.1 の見出しの固定のため）。
 *
 * PJTタブ（段階8）と詳細パネル（段階6）は、それぞれの段階で足す。
 *
 * 元に戻す・やり直すのキー（Ctrl+Z・Ctrl+Shift+Z・Ctrl+Y）は、画面全体で受けるので、ここで仕掛ける。
 */

import { Board } from './board/Board';
import { ProjectHeader } from './ProjectHeader';
import { SummaryCards } from './SummaryCards';
import { Toolbar } from './Toolbar';
import { useUndoShortcuts } from './useUndoShortcuts';
import styles from './App.module.css';

export function App() {
  useUndoShortcuts();
  return (
    <main className={styles.app}>
      <ProjectHeader />
      <SummaryCards />
      <Toolbar />
      <Board />
    </main>
  );
}
