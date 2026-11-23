/**
 * タスク表の行の並べ方（tasks.md 4-4・4-8）
 *
 * core/schedule.ts の行の一覧（ScheduleRow[]）は「画面に出す順」に並んでいて、
 * それぞれの行は階層（level：工程 0、親 1、子 2、孫 3）を持っている。
 * ただ、画面に出すにはそれだけでは足りない：
 * - 親のカードに出す「子の数」
 * - ツリー線を引くための「兄弟の中で最後か」「どの祖先の線を下へ延ばすか」
 * - 親をたたんだときに「隠れる行か」
 *
 * どれも行の並び（level の並び）から求められるので、ここでまとめて計算する。
 * React に依存しない純粋な関数にして、Vitest で確かめられるようにする。
 */

import type { ScheduleRow } from '../../core/types';

/** 1行ぶんの並べ方 */
export interface RowLayout {
  row: ScheduleRow;
  /** 直下の子の数。末端と、タスクのない工程は 0 */
  childCount: number;
  /** 同じ親を持つ兄弟の中で最後の行か。最後なら、ツリー線の縦線を行の真ん中で止める */
  isLastSibling: boolean;
  /**
   * この行の左側に、縦線を上から下まで通す祖先の階層。
   *
   * ツリー線は「子 → 親」を結ぶ線なので、ある祖先の下にまだ兄弟が続くなら、
   * その祖先の縦線は、間にある行（その祖先の子孫）をまたいで下へ延びる必要がある。
   * 例：孫の行で、その親（子の階層）の後ろにまだ兄弟があれば、子の階層の縦線を通す。
   *
   * 階層 2 以上の祖先だけを入れる（階層 1 の親は工程の帯の下に並ぶだけで、縦線で結ばないため）。
   */
  continuingLevels: number[];
  /** たたんだ親の子孫で、画面に出さない行か */
  hidden: boolean;
  /** この行がたたまれている親か（開閉マークの向きに使う） */
  collapsed: boolean;
}

/**
 * 行の一覧から、画面に並べるための情報を作る。
 *
 * @param rows 画面に出す順の行（schedule の結果）
 * @param collapsedIds たたんでいる親タスクの id（ストアの view.collapsedIds）
 */
export function layoutRows(
  rows: readonly ScheduleRow[],
  collapsedIds: ReadonlySet<string>,
): RowLayout[] {
  // --- 1. 子の数と、最後の兄弟か ---
  // ある行の「子」は、その行より後ろで、自分以下の階層の行が来るまでの間にある、ちょうど1つ深い行。
  // 「兄弟」は、自分より浅い行（親）が来るまでの間にある、同じ階層の行。
  // 行は多くても100行ほどなので、行ごとに後ろを見ていく素直な方法で数える。
  const childCounts: number[] = [];
  const lastFlags: boolean[] = [];
  rows.forEach((row, index) => {
    let childCount = 0;
    let isLast = true;
    // 自分より深い行が続く間は、自分の子孫の範囲。その中で、ちょうど1つ深い行が直下の子
    for (let next = index + 1; next < rows.length; next += 1) {
      const nextLevel = (rows[next] as ScheduleRow).level;
      if (nextLevel < row.level) {
        // 親の階層まで戻った。ここから先は別の親の行なので、兄弟はもういない
        break;
      }
      if (nextLevel === row.level) {
        // 同じ階層の行が来た。自分の子孫の範囲は終わり、兄弟がまだいる
        isLast = false;
        break;
      }
      if (nextLevel === row.level + 1) {
        childCount += 1;
      }
    }
    childCounts.push(childCount);
    lastFlags.push(isLast);
  });

  // --- 2. 祖先の縦線と、たたまれて隠れるか ---
  // 上から順に見ながら、「今の行の祖先」を階層ごとに覚えておく（ancestorIndexByLevel[階層] = 行の番号）。
  const ancestorIndexByLevel: number[] = [];
  /** たたんでいる親の階層。その親より深い行が続く間は隠す。たたんだ親の外に出たら null に戻す */
  let collapsedLevel: number | null = null;

  return rows.map((row, index) => {
    ancestorIndexByLevel[row.level] = index;
    // 自分より深い階層の記録は、前の兄弟の子孫のものなので捨てる
    ancestorIndexByLevel.length = row.level + 1;

    const continuingLevels: number[] = [];
    for (let level = 2; level < row.level; level += 1) {
      const ancestorIndex = ancestorIndexByLevel[level];
      if (ancestorIndex !== undefined && !lastFlags[ancestorIndex]) {
        continuingLevels.push(level);
      }
    }

    // たたんだ親の範囲から出たか（たたんだ親と同じか浅い行が来たら、範囲の外）
    if (collapsedLevel !== null && row.level <= collapsedLevel) {
      collapsedLevel = null;
    }
    const hidden = collapsedLevel !== null;
    const childCount = childCounts[index] as number;
    // 開閉できるのは、子を持つタスクの行だけ（工程の行はたたまない）
    const collapsed = row.kind === 'task' && childCount > 0 && collapsedIds.has(row.key);
    if (!hidden && collapsed) {
      collapsedLevel = row.level;
    }

    return {
      row,
      childCount,
      isLastSibling: lastFlags[index] as boolean,
      continuingLevels,
      hidden,
      collapsed,
    };
  });
}
