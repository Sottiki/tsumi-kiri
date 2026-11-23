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
 */

import { useMemo } from 'react';
import { selectActiveProject } from '../../store/appStore';
import { useAppStore } from '../../store';
import { displayedHoursPerDay, displayedRows } from '../../store/derived';
import { localToday } from '../../store/appStore';
import type { Project, Task } from '../../core/types';
import { BoardHeader } from './BoardHeader';
import { BoardRow } from './BoardRow';
import { layoutRows } from './rowLayout';
import styles from './Board.module.css';

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
  const toggleCollapsed = useAppStore((state) => state.actions.toggleCollapsed);

  // 表示中のモード（通常／残業）の行と、その1日の稼働時間
  const rows = displayedRows(computed);
  const hoursPerDay = displayedHoursPerDay(computed);

  // 行の並べ方（子の数・ツリー線・たたんで隠れるか）。行か開閉が変わったときだけ作り直す
  const layouts = useMemo(() => layoutRows(rows, collapsedIds), [rows, collapsedIds]);
  const tasksById = useMemo(() => indexTasks(project), [project]);

  // 今日の列（黄色）。カードの「今日から ○ 営業日」と同じく、使っている人のPCの日付で決める
  const today = localToday();

  // もう一方のモードの完了予定日（点線を引く日）。通常で見ているなら残業の、残業で見ているなら通常の完了予定
  const otherModeFinish = computed.overtime
    ? computed.cards.normal.finishDate
    : computed.cards.overtime.finishDate;

  return (
    <section className={styles.board} aria-label="タスク表とガント">
      <div className={styles.scroll} data-testid="board-scroll">
        <div className={styles.content}>
          <BoardHeader days={computed.days} today={today} endDate={project.end} />
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
                onToggle={toggleCollapsed}
              />
            ),
          )}
        </div>
      </div>
    </section>
  );
}
