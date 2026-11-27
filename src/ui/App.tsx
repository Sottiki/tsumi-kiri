/**
 * 画面全体（architecture.md 8章、DESIGN.md の Layout）
 *
 * 上から：ヘッダ → 上部のカード4枚 → 操作の列 → タスク表とガント。
 * 画面の高さいっぱいを縦に並べ、タスク表とガント（Board）だけが残りの高さを使ってスクロールする。
 * こうすると、ヘッダやカードは上に見えたまま、表とガントだけを動かせる（SPEC 3.1 の見出しの固定のため）。
 *
 * 一番上は PJTタブ（段階8）。
 * 詳細パネル（段階6）は画面の右に、知らせ（段階8）は画面の左下に浮かせる（position: fixed）ので、並びの外に置く。
 *
 * 元に戻す・やり直すのキー（Ctrl+Z・Ctrl+Shift+Z・Ctrl+Y）は、画面全体で受けるので、ここで仕掛ける。
 */

import { Board } from './board/Board';
import { NoticeToast } from './NoticeToast';
import { DetailPanel } from './panel/DetailPanel';
import { ProjectHeader } from './ProjectHeader';
import { SummaryCards } from './SummaryCards';
import { ProjectTabs } from './tabs/ProjectTabs';
import { Toolbar } from './Toolbar';
import { useUndoShortcuts } from './useUndoShortcuts';
import styles from './App.module.css';

export function App() {
  useUndoShortcuts();
  return (
    <main className={styles.app}>
      <ProjectTabs />
      <ProjectHeader />
      <SummaryCards />
      <Toolbar />
      <Board />
      <DetailPanel />
      <NoticeToast />
    </main>
  );
}
