/**
 * ドラッグでの並べ替えの状態と、画面の位置を測る処理（tasks.md 7-1・7-2、SPEC 3.1、決定事項73〜75）
 *
 * Board.tsx の DndContext（dnd-kit）に渡す値と、行に配る「薄くする行」「青い線」をまとめて返す。
 *
 * ■ 役割の分け方
 * - dnd-kit：掴む（5px 動いたら始める）、写しを指につける、枠の端で自動でスクロールする、
 *   Esc で取りやめる、ドラッグの後のクリックを止める
 * - ここ：指の位置と行の位置を測り、どの兄弟の間に落ちるかを決める（計算そのものは reorder.ts）
 * - 落としたら、ストアの reorderTask（core の reorderTask）で並べ替える。元に戻すの1件になる
 *
 * ■ dnd-kit の「落とす先（droppable）」を使わない理由
 * dnd-kit は、落とす先の部品の位置を、ドラッグを始めたときに測っておき、スクロールの分を足し引きして使う。
 * この一覧では、落とせる範囲が「兄弟の行と、その下の子孫の行のかたまり」で、1つの部品ではない。
 * そこで、指が動くたび・枠がスクロールするたびに、行の位置を getBoundingClientRect で測り直す。
 * どちらも画面の左上からの位置なので、スクロールの分を考えなくてよく、分かりやすい。
 * 兄弟は多くても数十なので、毎回測っても重くない。
 *
 * ■ 青い線を、行の中ではなく画面の上に浮かせて描く理由
 * 写しは指を中心に描かれ、青い線は指のすぐ近く（かたまりの境目）に出る。
 * 線を行の中に描くと、ほとんどの場合、写しの下に隠れて見えなくなる。
 * そこで、線は写しより手前に、画面に固定した位置（position: fixed）で描く（Board.tsx の .dropLine）。
 * 位置は、線を引く行の左のタスク表（rowLeft）を測って決める。
 */

import { type Announcements, type DragEndEvent, type DragStartEvent } from '@dnd-kit/core';
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import type { Task } from '../../core/types';
import { useDragSensors, useStopEscapeWhileDragging } from '../drag';
import {
  dragGroupOf,
  dropTargetFor,
  gapAt,
  type DragGroup,
  type DropTarget,
  type Span,
} from './reorder';
import type { RowLayout } from './rowLayout';

/**
 * 枠の端へ寄せたときの自動スクロール（SPEC 3.1）。縦だけにする。
 * threshold は、枠の高さ（幅）のうち、端からどれだけの所でスクロールを始めるかの割合。
 * 横を 0 にして、ガントが横に流れないようにする。
 */
export const AUTO_SCROLL = { threshold: { x: 0, y: 0.2 } };

interface Options {
  layouts: readonly RowLayout[];
  tasksById: ReadonlyMap<string, Task>;
  scrollRef: RefObject<HTMLDivElement | null>;
  headerRef: RefObject<HTMLDivElement | null>;
  /** 落としたときに呼ぶ（ストアの reorderTask） */
  onReorder: (taskId: string, overTaskId: string) => void;
}

export function useRowDrag({ layouts, tasksById, scrollRef, headerRef, onReorder }: Options) {
  // マウスで掴む。5px 動かしたらドラッグを始める。キーボードの部品は使わない（決定事項74。ui/drag.ts）
  const sensors = useDragSensors();

  /** 掴んでいるタスクと兄弟の並び。ドラッグしていなければ null */
  const [group, setGroup] = useState<DragGroup | null>(null);
  /** 青い線を描く位置。落とせない・落としても変わらない位置なら null */
  const [dropLine, setDropLine] = useState<DropLineBox | null>(null);

  // 描き直しを待たずに読みたい値は ref に置く（イベントの中で最新の値を読むため）
  const dropTargetRef = useRef<DropTarget | null>(null);
  const pointerRef = useRef<{ x: number; y: number } | null>(null);
  const draggingRef = useRef(false);

  // ドラッグ中は、指が動くたびと、枠がスクロールするたび（自動スクロールを含む）に、落とす先を測り直す
  useEffect(() => {
    const scroll = scrollRef.current;
    if (group === null || scroll === null) return;

    const update = () => {
      const target = measureDropTarget(scroll, headerRef.current, group, pointerRef.current);
      dropTargetRef.current = target;
      const line =
        target === null ? null : measureDropLine(scroll, headerRef.current, group, target);
      // 線の位置が変わらなければ、前の値のままにして、描き直さない
      setDropLine((previous) => (sameDropLine(previous, line) ? previous : line));
    };
    const handlePointerMove = (event: PointerEvent) => {
      pointerRef.current = { x: event.clientX, y: event.clientY };
      update();
    };

    window.addEventListener('pointermove', handlePointerMove);
    scroll.addEventListener('scroll', update);
    update();
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      scroll.removeEventListener('scroll', update);
    };
  }, [group, scrollRef, headerRef]);

  // ドラッグ中の Esc は取りやめだけにし、詳細パネルまで届けない（ui/drag.ts）
  useStopEscapeWhileDragging(draggingRef);

  /** ドラッグの状態をすべて消す（落としたとき・取りやめたとき） */
  const reset = () => {
    draggingRef.current = false;
    pointerRef.current = null;
    dropTargetRef.current = null;
    setGroup(null);
    setDropLine(null);
  };

  const handleDragStart = (event: DragStartEvent) => {
    const next = dragGroupOf(layouts, String(event.active.id));
    if (next === null) return;
    // 押した位置から測り始める（指が動くまでの間も、落とす先を決められるように）
    const start = event.activatorEvent;
    if (start instanceof PointerEvent) {
      pointerRef.current = { x: start.clientX, y: start.clientY };
    }
    draggingRef.current = true;
    setGroup(next);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const target = dropTargetRef.current;
    reset();
    // 落とせる位置で離したときだけ並べ替える。兄弟の外や、並びが変わらない位置では何もしない
    if (target !== null) onReorder(String(event.active.id), target.overKey);
  };

  // 元の場所で薄くする行：掴んだタスクのかたまり（自分と、画面に出ている子孫の行）
  const dimmedKeys = useMemo(
    () => new Set(group === null ? [] : (group.blocks[group.activeIndex] ?? [])),
    [group],
  );

  // 画面の読み上げの文言（dnd-kit が、画面に見えない場所に書き出す）。既定は英語なので日本語にする
  const nameOf = (id: string | number) => tasksById.get(String(id))?.name ?? '';
  const announcements: Announcements = {
    onDragStart: ({ active }) => `${nameOf(active.id)}を持ち上げました。`,
    onDragOver: () => undefined,
    onDragMove: () => undefined,
    onDragEnd: ({ active }) => `${nameOf(active.id)}を置きました。`,
    onDragCancel: ({ active }) => `${nameOf(active.id)}の並べ替えを取りやめました。`,
  };

  return {
    /** DndContext に渡す値 */
    contextProps: {
      sensors,
      autoScroll: AUTO_SCROLL,
      accessibility: {
        announcements,
        screenReaderInstructions: {
          draggable: 'マウスでドラッグすると、同じ階層の中で並べ替えられます。',
        },
      },
      onDragStart: handleDragStart,
      onDragEnd: handleDragEnd,
      onDragCancel: reset,
    },
    /** 掴んでいるタスクと兄弟の並び。写しを描くのに使う */
    group,
    dropLine,
    dimmedKeys,
  };
}

/**
 * 今の指の位置で、どこに落ちるかを測る。
 *
 * - 指が枠の外（ヘッダやカードの上、見出しの行の上）なら、落とせない（null）
 * - 兄弟のかたまりごとに、最初の行の上端と最後の行の下端を測り、reorder.ts の gapAt・dropTargetFor に渡す
 *
 * 位置はすべて、画面の左上からの位置（getBoundingClientRect）でそろえる。
 */
function measureDropTarget(
  scroll: HTMLElement,
  header: HTMLElement | null,
  group: DragGroup,
  pointer: { x: number; y: number } | null,
): DropTarget | null {
  if (pointer === null) return null;

  // 枠の中で、見出しより下の見える範囲だけを、落とせる場所にする
  const scrollRect = scroll.getBoundingClientRect();
  const visibleTop = scrollRect.top + (header?.offsetHeight ?? 0);
  const inside =
    pointer.x >= scrollRect.left &&
    pointer.x <= scrollRect.right &&
    pointer.y >= visibleTop &&
    pointer.y <= scrollRect.bottom;
  if (!inside) return null;

  /** 行の id から、その行の位置を測る。見つからなければ null */
  const rectOf = (key: string): DOMRect | null =>
    scroll.querySelector(`[data-row-key="${CSS.escape(key)}"]`)?.getBoundingClientRect() ?? null;

  // かたまりごとの縦の範囲：最初の行の上端から、最後の行の下端まで
  const spans: Span[] = [];
  for (const block of group.blocks) {
    const first = rectOf(block[0] as string);
    const last = rectOf(block[block.length - 1] as string);
    if (first === null || last === null) return null; // 行が画面から消えた（ふつうは起きない）
    spans.push({ start: first.top, end: last.bottom });
  }

  const gap = gapAt(spans, pointer.y);
  return gap === null ? null : dropTargetFor(group, gap);
}

/**
 * 青い線を描く位置（画面の左上からの位置。単位は px）。
 * 線を引く行の、左のタスク表（rowLeft）の横幅に合わせた、高さ 0 の箱。
 * 線の左端・右端（カードの左端・右端）は、CSS で level から決める（Board.module.css の .dropLine）
 */
export interface DropLineBox {
  /** 線の縦の位置（かたまりの境目） */
  top: number;
  /** 左のタスク表の左端と幅 */
  left: number;
  width: number;
  /** 掴んだタスクの階層。線の左端を、この階層のカードの左端にそろえる */
  level: number;
  /** 線を引く行の id と、その上端（before）か下端（after）か。画面のテストで確かめるための目印にも使う */
  rowKey: string;
  edge: 'before' | 'after';
}

/**
 * 青い線を描く位置を測る。
 * 線を引く行が、見出しの下に隠れている・枠の下へはみ出しているときは描かない（null）。
 * 浮かせて描く線は枠で切り取られないので、そのまま描くと見出しやヘッダの上に出てしまうため。
 */
function measureDropLine(
  scroll: HTMLElement,
  header: HTMLElement | null,
  group: DragGroup,
  target: DropTarget,
): DropLineBox | null {
  const rowElement = scroll.querySelector(`[data-row-key="${CSS.escape(target.line.rowKey)}"]`);
  // 行の最初の子が、左のタスク表（BoardRow の rowLeft）
  const tableRect = rowElement?.firstElementChild?.getBoundingClientRect();
  if (rowElement === null || tableRect === undefined) return null;

  const rowRect = rowElement.getBoundingClientRect();
  const top = target.line.edge === 'before' ? rowRect.top : rowRect.bottom;
  const scrollRect = scroll.getBoundingClientRect();
  const visibleTop = scrollRect.top + (header?.offsetHeight ?? 0);
  if (top < visibleTop || top > scrollRect.bottom) return null;

  return {
    top,
    left: tableRect.left,
    width: tableRect.width,
    level: group.level,
    rowKey: target.line.rowKey,
    edge: target.line.edge,
  };
}

/** 2つの線の位置が同じか。同じなら描き直さないために使う */
function sameDropLine(a: DropLineBox | null, b: DropLineBox | null): boolean {
  if (a === null || b === null) return a === b;
  return (
    a.top === b.top &&
    a.left === b.left &&
    a.width === b.width &&
    a.level === b.level &&
    a.rowKey === b.rowKey &&
    a.edge === b.edge
  );
}
