/**
 * タスク表とガントの1行（tasks.md 4-4・4-6・4-7・4-8）
 *
 * 左（タスク表、幅820px、左に固定）：
 * - 工程の行：スレートグレーの帯に白文字（ID・工程名・工数・進捗・残工数・開始・終了）
 * - タスクの行：1件ずつカードにする。階層の分だけ右へずらし、ツリー線で親とつなぐ。
 *   親は太字で、開閉マークと子の数の札。カードの下端に進捗ライン。
 *   エンド日を超えたら薄い赤のカードと赤字。期日を超えたら炎アイコン。メモがあればメモのアイコン
 * 右（ガント）：1日1マス。バーは完了分（濃い色）と残り（薄い色）で塗り分ける
 *
 * 段階5で足したもの：
 * - 末端の工数・進捗率の入力欄（5-1）。正しい値を打つたびに、ストアの updateTask で反映する
 * - 日程が変わった終了日のハイライト（5-3）。ストアの highlightKeys に入っている行だけ光らせる
 * - 工程の帯の「＋」（5-4）。その工程の末尾にタスクを足す
 *
 * React.memo で包み、行に渡す値が変わらなければ描き直さない（architecture.md 8章）。
 */

import { memo, type CSSProperties } from 'react';
import { formatMonthDay } from '../../core/calendar';
import { barCells } from '../../core/schedule';
import { PHASES } from '../../core/tree';
import type { TaskPatch } from '../../core/tree';
import type {
  DateString,
  GanttDay,
  HoursPerDay,
  PhaseId,
  ScheduleRow,
  Status,
  Task,
} from '../../core/types';
import { cx } from '../cx';
import { DraftInput } from '../DraftInput';
import { formatTenths, rowProgressPct } from '../format';
import { ChevronIcon, FireIcon, MemoIcon, PlusIcon } from '../icons';
import { parseEffortInput, parseProgressInput } from '../parse';
import type { RowLayout } from './rowLayout';
import styles from './Board.module.css';

interface BoardRowProps {
  layout: RowLayout;
  /** この行のタスク（優先度・期日・メモを出すため）。工程の行では undefined */
  task: Task | undefined;
  days: readonly GanttDay[];
  hoursPerDay: HoursPerDay;
  today: DateString;
  endDate: DateString | null;
  /** もう一方のモードの完了予定日。この日の列の右に点線を引く */
  otherModeFinish: DateString | null;
  /** 日程が変わったので、終了日をハイライトするか（SPEC 3.1：約1.5秒） */
  highlighted: boolean;
  /** 親タスクの開閉を切り替える */
  onToggle: (taskId: string) => void;
  /** タスクの項目を変える（ストアの updateTask） */
  onUpdateTask: (taskId: string, patch: TaskPatch) => void;
  /** 工程の末尾にタスクを足す（ストアの addTaskToPhase） */
  onAddToPhase: (phaseId: PhaseId) => void;
}

/** 優先度の記号と、色のクラス名（DESIGN.md：high `!!!`、mid `=`、low `-`） */
const PRIORITY_MARKS = {
  high: { mark: '!!!', className: 'priorityHigh' },
  mid: { mark: '=', className: 'priorityMid' },
  low: { mark: '-', className: 'priorityLow' },
} as const;

/** 状態の札のクラス名（DESIGN.md の chip-*） */
const STATUS_CHIPS: Record<Status, string> = {
  完了: 'chipDone',
  進行中: 'chipInProgress',
  未着手: 'chipNotStarted',
  超過: 'chipOver',
};

export const BoardRow = memo(function BoardRow(props: BoardRowProps) {
  const { layout } = props;
  const isPhase = layout.row.kind === 'phase';
  return (
    <div
      className={cx(styles.row, isPhase ? styles.phaseRow : styles.taskRow)}
      data-testid={`row-${layout.row.label}`}
      data-row-key={layout.row.key}
    >
      <div className={styles.rowLeft}>
        {isPhase ? (
          <PhaseBand row={layout.row} onAddToPhase={props.onAddToPhase} />
        ) : (
          <TaskCard {...props} />
        )}
      </div>
      <GanttCells {...props} />
    </div>
  );
});

// ---------------------------------------------------------------------------
// 左：工程の帯
// ---------------------------------------------------------------------------

function PhaseBand({
  row,
  onAddToPhase,
}: {
  row: ScheduleRow;
  onAddToPhase: (phaseId: PhaseId) => void;
}) {
  const isOver = row.status === '超過';
  const name = nameOfPhase(row);
  return (
    <div className={styles.phaseBand}>
      <div className={styles.colId}>{row.label}</div>
      <div className={styles.phaseNameCell}>
        <span className={styles.phaseName}>{name}</span>
        {/* 工程の帯からの追加（SPEC 3.1、決定事項57）。工程の行の key は工程の id（PhaseId） */}
        <button
          type="button"
          className={styles.phaseAdd}
          aria-label={`${name}にタスクを追加`}
          onClick={() => onAddToPhase(row.key as PhaseId)}
        >
          <PlusIcon />
        </button>
      </div>
      <div className={styles.colPriority} />
      <div className={styles.colNumberBold}>{formatTenths(row.effortTenths)}</div>
      <div className={styles.colProgress}>{rowProgressPct(row)}%</div>
      <div className={styles.colNumber}>{formatTenths(row.remainingTenths)}</div>
      <div className={styles.colDate}>{row.startDate && formatMonthDay(row.startDate)}</div>
      <div className={styles.colDateCenter}>
        {/* 終了日は、エンド日を超えたら赤い背景に白文字（DESIGN.md の工程の帯） */}
        <span className={cx(styles.phaseEnd, isOver && styles.phaseEndOver)}>
          {row.endDate && formatMonthDay(row.endDate)}
        </span>
      </div>
      <div className={styles.colDate} />
      <div className={styles.colStatus} />
    </div>
  );
}

/** 工程の名前。ScheduleRow は名前を持たないので、工程の id から引く */
function nameOfPhase(row: ScheduleRow): string {
  return PHASE_NAMES[row.key] ?? row.key;
}

/** 工程の名前は 5本で固定（core/tree.ts の PHASES）。id から名前を引ける表にしておく */
const PHASE_NAMES: Record<string, string> = Object.fromEntries(
  PHASES.map((phase) => [phase.id, phase.name]),
);

// ---------------------------------------------------------------------------
// 左：タスクのカード
// ---------------------------------------------------------------------------

function TaskCard({ layout, task, highlighted, onToggle, onUpdateTask }: BoardRowProps) {
  const { row, childCount, collapsed } = layout;
  const isParent = !row.leaf;
  const isOver = row.status === '超過';
  const name = task?.name ?? '';
  const progress = rowProgressPct(row);

  /**
   * 工数の欄に打った文字を反映する（5-1）。
   * 正しい値（0 以上・小数1桁まで）で、今の値と違うときだけ updateTask を呼ぶ。
   * 同じ値で呼ぶと、何も変わらないのに「元に戻す」の履歴が1件増えてしまうため。
   */
  const handleEffort = (text: string) => {
    const effortTenths = parseEffortInput(text);
    if (effortTenths !== null && effortTenths !== row.effortTenths) {
      onUpdateTask(row.key, { effortTenths });
    }
  };
  /** 進捗率の欄に打った文字を反映する（5-1）。正しい値（0〜100 の整数）のときだけ */
  const handleProgress = (text: string) => {
    const progressPct = parseProgressInput(text);
    if (progressPct !== null && progressPct !== row.progressPct) {
      onUpdateTask(row.key, { progressPct });
    }
  };

  // 階層を CSS に渡し、字下げとツリー線の位置を CSS の calc で決める（値は tokens.css の indent-step）
  const levelStyle = { '--level': row.level } as CSSProperties;

  return (
    <>
      <TreeLines layout={layout} />
      <div
        className={cx(styles.card, isParent && styles.cardParent, isOver && styles.cardOver)}
        style={levelStyle}
      >
        <div className={styles.cardId}>{row.label}</div>
        <div className={styles.cardName}>
          {isParent && (
            <button
              type="button"
              className={styles.toggle}
              aria-expanded={!collapsed}
              aria-label={`${name}の子タスクを${collapsed ? '広げる' : 'たたむ'}`}
              onClick={() => onToggle(row.key)}
            >
              <ChevronIcon className={cx(styles.chevron, collapsed && styles.chevronCollapsed)} />
            </button>
          )}
          {row.overDue && <FireIcon className={styles.fire} />}
          <span className={styles.nameText}>{name}</span>
          {isParent && <span className={styles.childCount}>{childCount}</span>}
          {task !== undefined && task.memo !== '' && <MemoIcon className={styles.memo} />}
        </div>

        {/* 優先度は末端だけに出す（画面案のとおり。親の優先度は使わない） */}
        <div className={cx(styles.colPriority, styles.priority)}>
          {row.leaf && task !== undefined && (
            <span className={styles[PRIORITY_MARKS[task.priority].className]}>
              {PRIORITY_MARKS[task.priority].mark}
            </span>
          )}
        </div>

        {/*
          工数・進捗率：末端は入力欄、親は子から集計した値（太字）。
          inputMode="decimal"・"numeric" で、タッチの端末では数字のキーボードを出す
        */}
        <div className={styles.cardEffort}>
          {row.leaf ? (
            <DraftInput
              className={styles.effortInput}
              aria-label={`${name}の工数（人日）`}
              inputMode="decimal"
              value={formatTenths(row.effortTenths)}
              onDraft={handleEffort}
            />
          ) : (
            <span className={styles.parentNumber}>{formatTenths(row.effortTenths)}</span>
          )}
        </div>
        <div className={styles.cardProgress}>
          {row.leaf ? (
            <>
              <DraftInput
                className={styles.progressInput}
                aria-label={`${name}の進捗率（%）`}
                inputMode="numeric"
                value={String(row.progressPct)}
                onDraft={handleProgress}
              />
              <span className={styles.percent}>%</span>
            </>
          ) : (
            <span className={styles.parentProgress}>{progress}%</span>
          )}
        </div>
        <div className={styles.cardRemaining}>{formatTenths(row.remainingTenths)}</div>
        <div className={styles.colDate}>{row.startDate && formatMonthDay(row.startDate)}</div>
        <div className={styles.colDateCenter}>
          {/* 日程が変わったら、終了日の背景を flash にする（5-3、DESIGN.md の Motion） */}
          <span
            className={cx(
              styles.endDate,
              isOver && styles.endDateOver,
              highlighted && styles.endDateFlash,
            )}
            data-testid={`end-date-${row.label}`}
          >
            {row.endDate && formatMonthDay(row.endDate)}
          </span>
        </div>
        <div className={styles.cardDue}>{task?.due && formatMonthDay(task.due)}</div>
        <div className={styles.colStatusCenter}>
          <span className={cx(styles.chip, styles[STATUS_CHIPS[row.status]])}>{row.status}</span>
        </div>

        {/* カードの下端の進捗ライン（幅＝進捗率） */}
        <div
          className={cx(
            styles.progressLine,
            isParent && styles.progressLineParent,
            isOver && styles.progressLineOver,
          )}
          style={{ width: `${progress}%` }}
        />
      </div>
    </>
  );
}

/**
 * ツリー線（DESIGN.md の tree-line）。画面案の線の引き方と同じ：
 * - 子・孫の行：親のカードの左から 10px の位置に縦線、そこから自分のカードまで横線。
 *   兄弟の最後なら、縦線は行の真ん中で止める
 * - 祖先の下にまだ兄弟が続くなら、その祖先の縦線をこの行にも通す（continuingLevels）
 * - 子を持つ親（たたんでいないとき）：カードの下から、子へ向かう短い縦線を出す
 */
function TreeLines({ layout }: { layout: RowLayout }) {
  const { row, isLastSibling, continuingLevels, childCount, collapsed } = layout;
  /** 縦線の位置は「どの階層のカードの左から 10px か」で決まる。CSS の --line-level に渡す */
  const at = (level: number) => ({ '--line-level': level }) as CSSProperties;

  return (
    <>
      {row.level >= 2 && (
        <>
          <div
            className={cx(styles.lineVertical, isLastSibling && styles.lineVerticalHalf)}
            style={at(row.level - 1)}
          />
          <div className={styles.lineHorizontal} style={at(row.level - 1)} />
        </>
      )}
      {continuingLevels.map((level) => (
        <div key={level} className={styles.lineVertical} style={at(level - 1)} />
      ))}
      {childCount > 0 && !collapsed && <div className={styles.lineStub} style={at(row.level)} />}
    </>
  );
}

// ---------------------------------------------------------------------------
// 右：ガントのマス
// ---------------------------------------------------------------------------

/**
 * バーの色のクラス。エンド日を超えたものは赤、末端は青、工程と親はグレー（DESIGN.md の bar-*）。
 * 完了分か残りかは、マスごとに barCells の done で決める。
 */
function barColorClass(row: ScheduleRow, done: boolean): string | undefined {
  if (row.status === '超過') return done ? styles.barOverDone : styles.barOverRest;
  if (row.leaf) return done ? styles.barLeafDone : styles.barLeafRest;
  if (row.kind === 'phase') return done ? styles.barParentDone : styles.barPhaseRest;
  return done ? styles.barParentDone : styles.barParentRest;
}

function GanttCells({ layout, days, hoursPerDay, today, endDate, otherModeFinish }: BoardRowProps) {
  const { row } = layout;
  const isPhase = row.kind === 'phase';

  // バーのマス（稼働日の番号 → 完了分か）。barCells は画面と Excel で共通の関数（core/schedule.ts）
  const doneByWorkday = new Map<number, boolean>();
  for (const cell of barCells(row, hoursPerDay)) {
    doneByWorkday.set(cell.workdayIndex, cell.done);
  }
  const barHeightClass = row.leaf ? styles.barLeaf : styles.barThin;

  return (
    <div className={styles.cells}>
      {days.map((day) => {
        const isWork = day.kind === 'work';
        const done = day.workdayIndex === null ? undefined : doneByWorkday.get(day.workdayIndex);
        return (
          <div
            key={day.date}
            className={cx(
              styles.cell,
              // 背景：土日祝はグレー、今日は黄色、工程の行の稼働日は薄いグレー（画面案と同じ優先の順）
              !isWork && styles.dayOff,
              isWork && day.date === today && styles.today,
              isWork && day.date !== today && isPhase && styles.phaseCell,
              // 縦線：エンド日の赤線を、もう一方のモードの点線より優先する
              day.date === otherModeFinish && styles.otherModeLine,
              day.date === endDate && styles.endLine,
            )}
          >
            {done !== undefined && (
              <div className={cx(styles.bar, barHeightClass, barColorClass(row, done))} />
            )}
          </div>
        );
      })}
    </div>
  );
}
