/**
 * タスク表とガント（tasks.md 4-4〜4-9、SPEC 3.1「左：タスク表」「右：ガント」、architecture.md 8章）
 *
 * 1つのスクロールの箱の中に、見出しの行（BoardHeader）と、タスクの行（BoardRow）を縦に並べる。
 * 1行は「左のタスク表（幅820px）」と「右の日付のマス」を横に並べた形。
 *
 * ■ 固定のしかた（4-9）
 * - 箱（.scroll）を縦横どちらにもスクロールできるようにし、画面の残りの高さいっぱいに広げる
 * - 見出しの行は position: sticky; top: 0 で、縦にスクロールしても上に残す
 * - 各行の左のタスク表は position: sticky; left: 0 で、横にスクロールしても左に残す
 * sticky は「一番近いスクロールの箱」に対して効く。ページ全体ではなくこの箱の中でスクロールさせるのは、
 * 横スクロールの箱の中にある見出しを、ページの縦スクロールに対して固定することはできないため。
 *
 * ここでは、ストアから読んだ値を行ごとに配るだけで、計算は core とストアに任せる。
 *
 * ■ 開いたタスクのバーまでスクロールする（6-2、SPEC 3.2、決定事項71）
 * 開いているタスクが変わったら（カードを押した・前後へ移った・＋タスク追加で足した）、
 * そのタスクのバーが、詳細パネルに隠れない範囲の中央に来るよう、横と縦にスクロールする。
 * パネルで値を変えただけ（開いているタスクは同じ）のときは動かさない。
 * 寸法を測るのはここ（DOM）、どこへスクロールするかの計算は scrollToBar.ts（純粋な関数）で行う。
 *
 * ■ ドラッグでの並べ替え（7-1・7-2、SPEC 3.1、決定事項73〜75）
 * 一覧を dnd-kit の DndContext で囲み、カード（BoardRow）を掴めるようにする。
 * ドラッグ中の状態（掴んだタスク・落とす先）は useRowDrag.ts が持ち、ここでは行に配るだけ。
 * - 元の場所の行を薄くする（dimmed）
 * - 指についてくる写し（DragOverlay の中の DragCard）
 * - 落とす位置の青い線（.dropLine）。写しに隠れないよう、写しより手前に、画面に固定した位置で描く
 */

import { DndContext, DragOverlay } from '@dnd-kit/core';
import { useEffect, useMemo, useRef, type CSSProperties } from 'react';
import { selectActiveProject } from '../../store/appStore';
import { useAppStore } from '../../store';
import { displayedHoursPerDay, displayedRows } from '../../store/derived';
import { localToday } from '../../store/appStore';
import type { Project, Task } from '../../core/types';
import { cx } from '../cx';
import { BoardHeader } from './BoardHeader';
import { BoardRow, DragCard } from './BoardRow';
import { layoutRows } from './rowLayout';
import { scrollTargetForBar } from './scrollToBar';
import { keepVertical, useRowDrag } from './useRowDrag';
import styles from './Board.module.css';

/**
 * 指についてくる写しの重なりの順（z-index）。詳細パネル（10）より手前に出す。
 * 青い線（Board.module.css の .dropLine、21）は、さらにその手前
 */
const DRAG_OVERLAY_Z_INDEX = 20;

/**
 * PJTのタスクを id から引ける表にする。
 * 計算結果の行（ScheduleRow）には、優先度・期日・メモが入っていないので、元のタスクから取り出すために使う。
 */
function indexTasks(project: Project): Map<string, Task> {
  const byId = new Map<string, Task>();
  const visit = (tasks: readonly Task[]) => {
    for (const task of tasks) {
      byId.set(task.id, task);
      visit(task.children);
    }
  };
  for (const phase of project.phases) {
    visit(phase.tasks);
  }
  return byId;
}

export function Board() {
  const project = useAppStore(selectActiveProject);
  const computed = useAppStore((state) => state.computed);
  const collapsedIds = useAppStore((state) => state.view.collapsedIds);
  const highlightKeys = useAppStore((state) => state.view.highlightKeys);
  const openTaskId = useAppStore((state) => state.view.openTaskId);
  const toggleCollapsed = useAppStore((state) => state.actions.toggleCollapsed);
  const updateTask = useAppStore((state) => state.actions.updateTask);
  const addTaskToPhase = useAppStore((state) => state.actions.addTaskToPhase);
  const openTask = useAppStore((state) => state.actions.openTask);
  const reorderTask = useAppStore((state) => state.actions.reorderTask);

  const scrollRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);

  // 開いているタスクが変わったら、そのバーが詳細パネルに隠れない範囲の中央に来るようスクロールする。
  // useEffect は描き終わった後に動くので、足したばかりの行も、開いたばかりのパネルも、もう画面にある
  useEffect(() => {
    const scroll = scrollRef.current;
    if (openTaskId === null || scroll === null) return;
    const rowElement = scroll.querySelector<HTMLElement>(`[data-row-key="${openTaskId}"]`);
    if (rowElement === null) return; // たたんで隠れている行は、スクロールしない
    scrollToOpenBar(scroll, rowElement, headerRef.current);
  }, [openTaskId]);

  // 表示中のモード（通常／残業）の行と、その1日の稼働時間
  const rows = displayedRows(computed);
  const hoursPerDay = displayedHoursPerDay(computed);

  // 行の並べ方（子の数・ツリー線・たたんで隠れるか）。行か開閉が変わったときだけ作り直す
  const layouts = useMemo(() => layoutRows(rows, collapsedIds), [rows, collapsedIds]);
  const tasksById = useMemo(() => indexTasks(project), [project]);

  // ドラッグでの並べ替え。落としたら、ストアの reorderTask で並べ替える（元に戻すの1件になる）
  const drag = useRowDrag({ layouts, tasksById, scrollRef, headerRef, onReorder: reorderTask });
  // 指についてくる写しに描く行（掴んでいるタスクの行）
  const draggedLayout =
    drag.group === null
      ? undefined
      : layouts.find((layout) => layout.row.key === drag.group?.activeKey);

  // 今日の列（黄色）。カードの「今日から ○ 営業日」と同じく、使っている人のPCの日付で決める
  const today = localToday();

  // もう一方のモードの完了予定日（点線を引く日）。通常で見ているなら残業の、残業で見ているなら通常の完了予定
  const otherModeFinish = computed.overtime
    ? computed.cards.normal.finishDate
    : computed.cards.overtime.finishDate;

  return (
    <section className={styles.board} aria-label="タスク表とガント">
      <DndContext {...drag.contextProps}>
        <div className={styles.scroll} data-testid="board-scroll" ref={scrollRef}>
          {/*
            パネルを開いている間は、中身の右にパネルの分の余白を足す（.contentWithPanel）。
            ガントの終わり近くのバー（完了予定の日など）も、パネルに隠れない所までスクロールできるように
          */}
          <div className={cx(styles.content, openTaskId !== null && styles.contentWithPanel)}>
            <BoardHeader ref={headerRef} days={computed.days} today={today} endDate={project.end} />
            {layouts.map((layout) =>
              layout.hidden ? null : (
                <BoardRow
                  key={layout.row.key}
                  layout={layout}
                  task={tasksById.get(layout.row.key)}
                  days={computed.days}
                  hoursPerDay={hoursPerDay}
                  today={today}
                  endDate={project.end}
                  otherModeFinish={otherModeFinish}
                  highlighted={highlightKeys.has(layout.row.key)}
                  isOpen={openTaskId === layout.row.key}
                  onOpen={openTask}
                  onToggle={toggleCollapsed}
                  onUpdateTask={updateTask}
                  onAddToPhase={addTaskToPhase}
                  dimmed={drag.dimmedKeys.has(layout.row.key)}
                />
              ),
            )}
          </div>
        </div>
        {/*
          指についてくる写し。dnd-kit が、掴んだカードと同じ大きさで、画面の上に浮かせて描く。
          dropAnimation={null}：落としたときに写しが元の場所へ戻る動きを付けない（DESIGN.md の Motion：そのほかの動きは付けない）
        */}
        <DragOverlay dropAnimation={null} modifiers={[keepVertical]} zIndex={DRAG_OVERLAY_Z_INDEX}>
          {draggedLayout !== undefined && (
            <DragCard layout={draggedLayout} task={tasksById.get(draggedLayout.row.key)} />
          )}
        </DragOverlay>
        {/*
          落とす位置の青い線（7-2、決定事項75）。位置は useRowDrag.ts が測る。
          data-drop-row・data-drop-edge は、画面のテストで線の位置を確かめるための目印
        */}
        {drag.dropLine !== null && (
          <div
            className={styles.dropLine}
            style={
              {
                top: drag.dropLine.top,
                left: drag.dropLine.left,
                width: drag.dropLine.width,
                '--drop-level': drag.dropLine.level,
              } as CSSProperties
            }
            data-drop-row={drag.dropLine.rowKey}
            data-drop-edge={drag.dropLine.edge}
          />
        )}
      </DndContext>
    </section>
  );
}

/**
 * 開いたタスクのバーが、詳細パネルに隠れない範囲の中央に来るようスクロールする（6-2）。
 *
 * ここでは寸法を測るだけで、どこへスクロールするかは scrollTargetForBar（scrollToBar.ts）で決める。
 * 測った位置は、すべて「枠の中身の左上からの距離」に直して渡す。
 * getBoundingClientRect は画面の左上からの位置なので、枠の左上（枠線の内側）を引き、
 * 今スクロールしている分を足すと、中身の中での位置になる。
 *
 * ブラウザの scrollIntoView を使わないのは、左に固定したタスク表・上に固定した見出し・
 * 右に浮かぶ詳細パネルに隠れる分を考えてくれないため。
 *
 * @param header 上に固定している見出しの行。高さを、上に隠れる分として使う
 */
function scrollToOpenBar(scroll: HTMLElement, rowElement: HTMLElement, header: HTMLElement | null) {
  const scrollRect = scroll.getBoundingClientRect();
  /** 画面の上の x を、枠の中身の中での x に直す */
  const toContentX = (x: number) => x - scrollRect.left - scroll.clientLeft + scroll.scrollLeft;
  /** 画面の上の y を、枠の中身の中での y に直す */
  const toContentY = (y: number) => y - scrollRect.top - scroll.clientTop + scroll.scrollTop;

  // バーの左端と右端：バーのあるマス（data-bar）の最初と最後
  const barCells = rowElement.querySelectorAll<HTMLElement>('[data-bar]');
  const firstCell = barCells[0];
  const lastCell = barCells[barCells.length - 1];
  const bar =
    firstCell !== undefined && lastCell !== undefined
      ? {
          left: toContentX(firstCell.getBoundingClientRect().left),
          right: toContentX(lastCell.getBoundingClientRect().right),
        }
      : null;

  // 左に固定しているタスク表の幅（行の左側の部品の幅）
  const stickyLeft = rowElement.firstElementChild?.getBoundingClientRect().width ?? 0;

  // 詳細パネルが、枠の右側をどれだけ隠しているか。
  // 枠の中身の右端（スクロールバーを除く）から、パネルの左端までの幅
  const panel = document.querySelector<HTMLElement>('[data-detail-panel]');
  const viewportRight = scrollRect.left + scroll.clientLeft + scroll.clientWidth;
  const hiddenRight =
    panel === null ? 0 : Math.max(0, viewportRight - panel.getBoundingClientRect().left);

  const rowRect = rowElement.getBoundingClientRect();
  const target = scrollTargetForBar({
    viewportWidth: scroll.clientWidth,
    viewportHeight: scroll.clientHeight,
    contentWidth: scroll.scrollWidth,
    contentHeight: scroll.scrollHeight,
    stickyLeft,
    stickyTop: header?.offsetHeight ?? 0,
    hiddenRight,
    bar,
    rowTop: toContentY(rowRect.top),
    rowHeight: rowRect.height,
  });

  // なめらかにスクロールする。OS で「視差効果を減らす」が有効なら、すぐに移る（DESIGN.md の Motion）
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  scroll.scrollTo({
    ...(target.left === null ? {} : { left: target.left }),
    top: target.top,
    behavior: reduceMotion ? 'auto' : 'smooth',
  });
}
