/**
 * PJTタブのドラッグでの並べ替え（tasks.md 8-1、SPEC 3.1、決定事項79）
 *
 * タスクの並べ替え（ui/board/useRowDrag.ts）と同じ考え方で、向きだけを横にしたもの。
 * - dnd-kit：掴む（マウスだけ・5px 動いたら始める）、写しを指につける、帯の端で自動で横にスクロールする、
 *   Esc で取りやめる、ドラッグの後のクリック（タブの切り替え）を止める
 * - ここ：指の位置とタブの位置を測り、どのタブの間に落ちるかを決める（計算は ui/board/reorder.ts の gapAt・dropTargetFor）
 * - 落としたら、ストアの reorderProject（core の appData.reorderProject）で並べ替える。元に戻すの1件になる
 *
 * タスクと違う点：
 * - タブには階層がないので、すべてのタブが兄弟で、1つのタブが1つのかたまり
 * - 帯の端より外へ指を動かしたら、先頭（末尾）に落ちるようにする（範囲の中に寄せてから gapAt に渡す）。
 *   右端の「＋」のあたりまで動かしたときに、末尾に落ちないと分かりにくいため
 * - 帯より上下に大きく外れたら（ヘッダやカードの上）、落とせない
 * - 青い線は縦線。タブの左端（before）か右端（after）に、タブの高さで引く
 */

import type { Announcements, DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import { useEffect, useRef, useState, type RefObject } from 'react';
import type { Project } from '../../core/types';
import { dropTargetFor, gapAt, type DragGroup, type DropTarget, type Span } from '../board/reorder';
import { useDragSensors, useStopEscapeWhileDragging } from '../drag';

/**
 * 帯の端へ寄せたときの自動スクロール。横だけにする（タブは横に並ぶため）。
 * threshold は、帯の幅のうち、端からどれだけの所でスクロールを始めるかの割合
 */
const AUTO_SCROLL = { threshold: { x: 0.2, y: 0 } };

/** 青い縦線を描く位置（画面の左上からの位置。単位は px） */
export interface TabDropLine {
  /** 線の横の位置（タブの左端か右端） */
  left: number;
  /** 線の上端と高さ（タブの上端と高さ） */
  top: number;
  height: number;
  /** 線を引くタブの PJT の id と、その左端（before）か右端（after）か。画面のテストの目印にも使う */
  projectId: string;
  edge: 'before' | 'after';
}

interface Options {
  projects: readonly Project[];
  /** タブを並べている、横にスクロールする箱 */
  listRef: RefObject<HTMLDivElement | null>;
  /** 落としたときに呼ぶ（ストアの reorderProject） */
  onReorder: (projectId: string, overProjectId: string) => void;
}

export function useTabDrag({ projects, listRef, onReorder }: Options) {
  const sensors = useDragSensors();

  /** 掴んでいるタブの PJT の id。ドラッグしていなければ null */
  const [activeId, setActiveId] = useState<string | null>(null);
  /** 青い線を描く位置。落とせない・落としても変わらない位置なら null */
  const [dropLine, setDropLine] = useState<TabDropLine | null>(null);

  const dropTargetRef = useRef<DropTarget | null>(null);
  const pointerRef = useRef<{ x: number; y: number } | null>(null);
  const draggingRef = useRef(false);
  useStopEscapeWhileDragging(draggingRef);

  // ドラッグ中は、指が動くたびと、帯がスクロールするたび（自動スクロールを含む）に、落とす先を測り直す
  useEffect(() => {
    const list = listRef.current;
    if (activeId === null || list === null) return;

    // タブには階層がないので、すべてのタブが兄弟で、1つのタブが1つのかたまり（reorder.ts の DragGroup の形にする）
    const ids = projects.map((p) => p.id);
    const group: DragGroup = {
      activeKey: activeId,
      level: 0,
      siblingKeys: ids,
      activeIndex: ids.indexOf(activeId),
      blocks: ids.map((id) => [id]),
    };

    const update = () => {
      const measured = measureDrop(list, group, pointerRef.current);
      dropTargetRef.current = measured?.target ?? null;
      const line = measured?.line ?? null;
      setDropLine((previous) => (sameLine(previous, line) ? previous : line));
    };
    const handlePointerMove = (event: PointerEvent) => {
      pointerRef.current = { x: event.clientX, y: event.clientY };
      update();
    };

    window.addEventListener('pointermove', handlePointerMove);
    list.addEventListener('scroll', update);
    update();
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      list.removeEventListener('scroll', update);
    };
  }, [activeId, projects, listRef]);

  const reset = () => {
    draggingRef.current = false;
    pointerRef.current = null;
    dropTargetRef.current = null;
    setActiveId(null);
    setDropLine(null);
  };

  const handleDragStart = (event: DragStartEvent) => {
    const start = event.activatorEvent;
    if (start instanceof PointerEvent) {
      pointerRef.current = { x: start.clientX, y: start.clientY };
    }
    draggingRef.current = true;
    setActiveId(String(event.active.id));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const target = dropTargetRef.current;
    reset();
    if (target !== null) onReorder(String(event.active.id), target.overKey);
  };

  // 画面の読み上げの文言（dnd-kit の既定は英語なので日本語にする。architecture.md 8章）
  const nameOf = (id: string | number) => projects.find((p) => p.id === String(id))?.name ?? '';
  const announcements: Announcements = {
    onDragStart: ({ active }) => `PJT「${nameOf(active.id)}」のタブを持ち上げました。`,
    onDragOver: () => undefined,
    onDragMove: () => undefined,
    onDragEnd: ({ active }) => `PJT「${nameOf(active.id)}」のタブを置きました。`,
    onDragCancel: ({ active }) => `PJT「${nameOf(active.id)}」のタブの並べ替えを取りやめました。`,
  };

  return {
    /** DndContext に渡す値 */
    contextProps: {
      sensors,
      autoScroll: AUTO_SCROLL,
      accessibility: {
        announcements,
        screenReaderInstructions: {
          draggable: 'マウスでドラッグすると、PJTのタブを並べ替えられます。',
        },
      },
      onDragStart: handleDragStart,
      onDragEnd: handleDragEnd,
      onDragCancel: reset,
    },
    /** 掴んでいるタブの PJT の id。元の場所を薄くするのと、写しを描くのに使う */
    activeId,
    dropLine,
  };
}

/** タブの id から、そのタブの部品を探す（ProjectTabs.tsx の data-project-id） */
function tabElement(list: HTMLElement, projectId: string): HTMLElement | null {
  return list.querySelector<HTMLElement>(`[data-project-id="${CSS.escape(projectId)}"]`);
}

/**
 * 今の指の位置で、どこに落ちるかと、青い線の位置を測る。落とせないなら null。
 * 位置はすべて、画面の左上からの位置（getBoundingClientRect）でそろえる。
 */
function measureDrop(
  list: HTMLElement,
  group: DragGroup,
  pointer: { x: number; y: number } | null,
): { target: DropTarget; line: TabDropLine | null } | null {
  if (pointer === null) return null;

  // 帯（タブを並べた箱）より上下に外れたら、落とせない
  const listRect = list.getBoundingClientRect();
  if (pointer.y < listRect.top || pointer.y > listRect.bottom) return null;

  const spans: Span[] = [];
  for (const id of group.siblingKeys) {
    const rect = tabElement(list, id)?.getBoundingClientRect();
    if (rect === undefined) return null;
    spans.push({ start: rect.left, end: rect.right });
  }
  const first = spans[0];
  const last = spans[spans.length - 1];
  if (first === undefined || last === undefined) return null;

  // 帯の端より外へ動かしたときは、いちばん端のタブの上にいるものとして扱う（先頭・末尾に落ちる）
  const x = Math.min(Math.max(pointer.x, first.start), last.end);
  const gap = gapAt(spans, x);
  const target = gap === null ? null : dropTargetFor(group, gap);
  if (target === null) return null;

  // 線を引くタブの左端か右端。帯の見える範囲の外（スクロールで隠れている所）なら、線は描かない
  const tabRect = tabElement(list, target.line.rowKey)?.getBoundingClientRect();
  if (tabRect === undefined) return { target, line: null };
  const left = target.line.edge === 'before' ? tabRect.left : tabRect.right;
  const visible = left >= listRect.left && left <= listRect.right;
  return {
    target,
    line: visible
      ? {
          left,
          top: tabRect.top,
          height: tabRect.height,
          projectId: target.line.rowKey,
          edge: target.line.edge,
        }
      : null,
  };
}

/** 2つの線の位置が同じか。同じなら描き直さないために使う */
function sameLine(a: TabDropLine | null, b: TabDropLine | null): boolean {
  if (a === null || b === null) return a === b;
  return (
    a.left === b.left &&
    a.top === b.top &&
    a.height === b.height &&
    a.projectId === b.projectId &&
    a.edge === b.edge
  );
}
