/**
 * ドラッグでの並べ替えの計算（tasks.md 段階7、SPEC 3.1、決定事項73〜75）
 *
 * ドラッグの部品（dnd-kit）は「どのカードを掴んだか」と「指がどこにあるか」を教えてくれる。
 * ここでは、その2つから次を決める：
 * - 掴んだタスクの兄弟はどれか（落とせるのは兄弟の間だけ。SPEC 3.1：同じ階層の中だけ）
 * - 指の位置なら、どの兄弟の間に落ちるか。そのとき青い線をどの行に引くか
 * - 落としたときに、core の reorderTask へ何を渡すか
 *
 * React にも DOM にも依存しない純粋な関数にして、Vitest で確かめられるようにする
 * （行の位置を測るのは Board.tsx、計算はここ。scrollToBar.ts と同じ分け方）。
 *
 * ■ 「かたまり」
 * 一覧は、親の行のすぐ下に子・孫の行が並ぶ1本の並びになっている（rowLayout.ts）。
 * 親を動かすと子もまとめて動くので、並べ替えでは「兄弟の行と、その下に出ている子孫の行」を
 * 1つのかたまりとして扱う。落とす位置は、かたまりとかたまりの間にしか来ない。
 */

import type { RowLayout } from './rowLayout';

/** ドラッグしているタスクと、その兄弟の並び */
export interface DragGroup {
  /** 掴んだタスクの id */
  activeKey: string;
  /** 掴んだタスクの階層（親 1、子 2、孫 3）。青い線の左端の位置に使う */
  level: number;
  /** 兄弟の id（画面の上から順。掴んだタスク自身も含む） */
  siblingKeys: string[];
  /** 掴んだタスクが、兄弟の中で何番目か（0 から） */
  activeIndex: number;
  /**
   * 兄弟ごとのかたまり：兄弟の行と、その下に出ている子孫の行の id（上から順）。
   * siblingKeys と同じ順に並ぶ。たたんで隠れている行は入れない（画面にないので測れないため）
   */
  blocks: string[][];
}

/**
 * 掴んだタスクの兄弟の並びを、行の並びから作る。
 * 工程の行や、たたんで隠れている行（画面にない）を掴んだときは null。
 *
 * 行は「画面に出す順」で、それぞれ階層を持っている。兄弟の範囲は、
 * - 上へたどって最初に出てくる、自分より浅い行（親。工程の直下なら工程の行）の次から
 * - 下へたどって、また自分より浅い行が来る手前まで
 * で、その中の「自分と同じ階層の行」が兄弟になる。深い行は、直前の兄弟の子孫。
 */
export function dragGroupOf(layouts: readonly RowLayout[], activeKey: string): DragGroup | null {
  // 画面に出ている行だけを見る。隠れている行は、かたまりにも入れない
  const visible = layouts.filter((layout) => !layout.hidden);
  const activePosition = visible.findIndex((layout) => layout.row.key === activeKey);
  const active = visible[activePosition];
  if (active === undefined || active.row.kind !== 'task') return null;
  const level = active.row.level;

  // 親の行を探す：自分より上で、最初に出てくる浅い行
  let parentPosition = activePosition - 1;
  while (parentPosition >= 0 && (visible[parentPosition] as RowLayout).row.level >= level) {
    parentPosition -= 1;
  }

  // 親の次の行から、浅い行が来るまでを、兄弟ごとのかたまりに分ける
  const blocks: string[][] = [];
  for (let position = parentPosition + 1; position < visible.length; position += 1) {
    const row = (visible[position] as RowLayout).row;
    if (row.level < level) break; // 親の外に出た（親の次の兄弟や、次の工程）
    if (row.level === level) {
      blocks.push([row.key]); // 新しい兄弟。ここから新しいかたまり
    } else {
      blocks[blocks.length - 1]?.push(row.key); // 深い行は、直前の兄弟の子孫
    }
  }

  const siblingKeys = blocks.map((block) => block[0] as string);
  return {
    activeKey,
    level,
    siblingKeys,
    activeIndex: siblingKeys.indexOf(activeKey),
    blocks,
  };
}

/** かたまりの縦の範囲（画面の上からの位置。単位は px） */
export interface BlockRect {
  top: number;
  bottom: number;
}

/**
 * 指の縦の位置から、どの「すき間」に落ちるかを決める。
 *
 * すき間は、かたまりとかたまりの間に番号を振ったもの：
 * 0 が先頭のかたまりの前、1 が1番目と2番目の間、……、n（かたまりの数）が最後のかたまりの後ろ。
 * 指が、あるかたまりの上半分にあればその前のすき間、下半分にあれば後ろのすき間を選ぶ。
 *
 * 兄弟の範囲の外（先頭のかたまりの上端より上、最後のかたまりの下端より下）なら null。
 * 別の工程・別の親の行の上では落とせない（SPEC 3.1、決定事項75）。
 *
 * @param rects かたまりごとの縦の範囲。上から順
 */
export function gapAt(rects: readonly BlockRect[], pointerY: number): number | null {
  const first = rects[0];
  const last = rects[rects.length - 1];
  if (first === undefined || last === undefined) return null;
  if (pointerY < first.top || pointerY > last.bottom) return null;

  for (let index = 0; index < rects.length; index += 1) {
    const rect = rects[index] as BlockRect;
    const middle = (rect.top + rect.bottom) / 2;
    if (pointerY < middle) return index;
  }
  return rects.length;
}

/** 落とす先 */
export interface DropTarget {
  /**
   * core の reorderTask に渡す「落とした先のタスク」の id。
   * reorderTask は、下へ動かすときはこのタスクの後ろ、上へ動かすときは前に入れる（dnd-kit の arrayMove と同じ）
   */
  overKey: string;
  /** 青い線を引く行の id と、その行の上端（before）か下端（after）か */
  line: { rowKey: string; edge: 'before' | 'after' };
}

/**
 * すき間の番号から、落とす先を決める。
 *
 * 自分のすぐ前（activeIndex）と、すぐ後ろ（activeIndex + 1）のすき間は、
 * 落としても並びが変わらないので null にする（線も引かない）。
 *
 * - 上へ動かす（すき間 < activeIndex）：そのすき間の後ろの兄弟の「前」に入る
 * - 下へ動かす（すき間 > activeIndex + 1）：そのすき間の前の兄弟の「後ろ」に入る
 *
 * 線は、すき間の後ろのかたまりの最初の行の上端に引く。
 * 最後のすき間（n）だけは後ろにかたまりがないので、最後のかたまりの最後の行の下端に引く。
 */
export function dropTargetFor(group: DragGroup, gap: number): DropTarget | null {
  const { siblingKeys, activeIndex, blocks } = group;
  if (gap === activeIndex || gap === activeIndex + 1) return null;
  if (gap < 0 || gap > siblingKeys.length) return null;

  // 上へ動かすなら、すき間の後ろの兄弟。下へ動かすなら、すき間の前の兄弟
  const overKey = (gap < activeIndex ? siblingKeys[gap] : siblingKeys[gap - 1]) as string;

  const nextBlock = blocks[gap];
  if (nextBlock !== undefined) {
    return { overKey, line: { rowKey: nextBlock[0] as string, edge: 'before' } };
  }
  // 最後のすき間：最後のかたまりの、いちばん下の行の下端
  const lastBlock = blocks[blocks.length - 1] as string[];
  return { overKey, line: { rowKey: lastBlock[lastBlock.length - 1] as string, edge: 'after' } };
}
