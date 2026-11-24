/**
 * 状態（完了・進行中・未着手・超過）から、札のクラス名を引く（DESIGN.md の chip-*）。
 * タスク表のカードと詳細パネルで同じ札を出すので、ここにまとめる。
 */

import type { Status } from '../core/types';
import chips from './chips.module.css';

/** 状態ごとの札のクラス名。chips.module.css の各クラスは .chip の見た目も含んでいる（composes） */
export const STATUS_CHIP_CLASS: Record<Status, string | undefined> = {
  完了: chips.chipDone,
  進行中: chips.chipInProgress,
  未着手: chips.chipNotStarted,
  超過: chips.chipOver,
};
