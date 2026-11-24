/**
 * 詳細パネル（tasks.md 段階6、SPEC 3.2、画面案③）
 *
 * タスクのカードをクリックすると、画面の右に浮いた形で開く（上下と右に16px空ける。背景は暗くしない）。
 * 開いているタスクは、ストアの view.openTaskId で決まる。閉じているときは何も描かない。
 *
 * ■ 中身（上から順に。SPEC 3.2）
 * 1. 上部：ID・工程・タスク名（その場で編集）・状態の札。前後への移動と、閉じるボタン（6-3）
 * 2. 警告：期日・エンド日を超えたとき（6-4）
 * 3. 工数・進捗率・残工数・進捗バー（6-5）。親は自動の値を、編集できない欄に出す（決定事項67）
 * 4. 優先度・期日（6-6）。親は優先度を出さない（決定事項67）
 * 5. 日程：通常と残業の開始日・終了日（6-7）
 * 6. 工程と親タスクの付け替え（6-8）
 * 7. メモ（6-9）
 * 8. 下部：削除（件数つきの確認）、＋子タスクを追加（6-10）
 *
 * ■ 入力のしかた
 * 保存ボタンは置かない。打った瞬間に、ストアの操作で反映する（SPEC 3.2、決定事項5）。
 * 文字の欄は DraftInput・DraftTextarea を使い、一覧の欄と同じく
 * 「正しい値のときだけ反映」「欄に入ってから離れるまでを、元に戻すの1件にまとめる」動きにする。
 *
 * ■ 計算
 * 日程・状態・警告は core とストアが作ったもの（computed）を読むだけで、ここでは計算しない。
 * パネルだけで使う小さな並べ替え（前後のタスク、親の選択肢など）は panelModel.ts に置く。
 */

import { useEffect, useId, useMemo, useState } from 'react';
import { formatMonthDayWeekday } from '../../core/calendar';
import { buildWarnings } from '../../core/schedule';
import {
  canAddChild,
  countDescendants,
  findTask,
  listMoveTargets,
  PHASES,
  PRIORITIES,
} from '../../core/tree';
import type { Priority, PhaseId, ScheduleRow, Task } from '../../core/types';
import { selectActiveProject } from '../../store/appStore';
import { useAppStore } from '../../store';
import { displayedRows } from '../../store/derived';
import { layoutRows } from '../board/rowLayout';
import { ConfirmDialog } from '../ConfirmDialog';
import controls from '../controls.module.css';
import chips from '../chips.module.css';
import { cx } from '../cx';
import { DraftInput, DraftTextarea } from '../DraftInput';
import { formatTenths, rowProgressPct } from '../format';
import { ChevronDownIcon, ChevronUpIcon, CloseIcon, FireIcon, WarningIcon } from '../icons';
import {
  MAX_INPUT_YEAR,
  MIN_INPUT_YEAR,
  parseDateInput,
  parseEffortInput,
  parseProgressInput,
} from '../parse';
import { STATUS_CHIP_CLASS } from '../statusChip';
import { doneTenths, endTone, findNeighbors, parentOptions } from './panelModel';
import styles from './DetailPanel.module.css';

/** 優先度のボタンに出す記号（DESIGN.md：high `!!!`、mid `=`、low `-`）と、読み上げの名前 */
const PRIORITY_BUTTONS: Record<Priority, { mark: string; name: string; selected: string }> = {
  high: { mark: '!!!', name: '高', selected: styles.priorityHigh ?? '' },
  mid: { mark: '=', name: '中', selected: styles.priorityMid ?? '' },
  low: { mark: '-', name: '低', selected: styles.priorityLow ?? '' },
};

/** 期日の欄のカレンダーで選べる範囲（決定事項60。ヘッダの開始日・エンド日と同じ） */
const DATE_MIN = `${MIN_INPUT_YEAR}-01-01`;
const DATE_MAX = `${MAX_INPUT_YEAR}-12-31`;

/** 工程の id から名前を引く表（工程は5本で固定。core/tree.ts の PHASES） */
const PHASE_NAMES = Object.fromEntries(PHASES.map((phase) => [phase.id, phase.name])) as Record<
  PhaseId,
  string
>;

// ---------------------------------------------------------------------------
// 入口：開いているタスクがあるときだけ描く
// ---------------------------------------------------------------------------

export function DetailPanel() {
  const openTaskId = useAppStore((state) => state.view.openTaskId);
  if (openTaskId === null) return null;
  // key にタスクの id を入れる。別のタスクへ移ったら、パネルの中の状態（打ちかけの文字、
  // 削除の確認を出しているか）を捨てて、まっさらな状態から描くため
  return <OpenPanel key={openTaskId} taskId={openTaskId} />;
}

// ---------------------------------------------------------------------------
// パネル本体
// ---------------------------------------------------------------------------

function OpenPanel({ taskId }: { taskId: string }) {
  const project = useAppStore(selectActiveProject);
  const computed = useAppStore((state) => state.computed);
  const collapsedIds = useAppStore((state) => state.view.collapsedIds);
  const daysOff = useAppStore((state) => state.data.daysOff);
  const actions = useAppStore((state) => state.actions);
  const { openTask } = actions;

  // 削除の確認を出しているか
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // 一覧に表示されている行の並び。前後への移動に使う（たたんで隠れている行を飛ばすため）
  const rows = displayedRows(computed);
  const layouts = useMemo(() => layoutRows(rows, collapsedIds), [rows, collapsedIds]);

  // Esc キーで閉じる（決定事項63）。日本語入力の変換を取り消す Esc では閉じない
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.isComposing) openTask(null);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [openTask]);

  // 開いているタスクと、その計算結果の行（表示中のモード・通常・残業）
  const location = findTask(project, taskId);
  const row = rows.find((r) => r.key === taskId);
  const normalRow = computed.normalRows.find((r) => r.key === taskId);
  const overtimeRow = computed.overtimeRows.find((r) => r.key === taskId);
  // タスクが消えたときはストアがパネルを閉じるので、ふつうはここに来ない。
  // 念のため、そろわないときは何も描かない
  if (
    location === null ||
    row === undefined ||
    normalRow === undefined ||
    overtimeRow === undefined
  ) {
    return null;
  }
  const { task } = location;

  const neighbors = findNeighbors(layouts, taskId);
  const warnings = buildWarnings(task.due, project.end, daysOff, normalRow, overtimeRow);
  const descendantCount = countDescendants(project, taskId);

  return (
    <aside className={styles.panel} aria-label="タスクの詳細" data-detail-panel>
      <PanelHeader
        task={task}
        row={row}
        phaseName={PHASE_NAMES[location.phaseId]}
        prevId={neighbors.prevId}
        nextId={neighbors.nextId}
      />

      <div className={styles.body}>
        {warnings.map((warning) => (
          <div key={warning.kind} className={styles.warning}>
            <WarningIcon className={styles.warningIcon} />
            <div className={styles.warningText}>
              <div className={styles.warningTitle}>{warning.title}</div>
              <div>{warning.detail}</div>
            </div>
          </div>
        ))}

        <EffortSection task={task} row={row} />
        <PriorityAndDue task={task} isLeaf={row.leaf} />
        <ScheduleTable
          normalRow={normalRow}
          overtimeRow={overtimeRow}
          overtimeShown={computed.overtime}
          projectEnd={project.end}
        />
        <MoveSection
          taskId={taskId}
          phaseId={location.phaseId}
          parentId={location.parentId}
          labelOf={(id) => rows.find((r) => r.key === id)?.label}
        />
        <MemoField task={task} />
      </div>

      <footer className={styles.footer}>
        <button type="button" className={controls.danger} onClick={() => setConfirmingDelete(true)}>
          削除
        </button>
        <div className={styles.spacer} />
        {/* 孫の階層では出さない（SPEC 3.2、決定事項12） */}
        {canAddChild(project, taskId) && (
          <button
            type="button"
            className={controls.secondary}
            onClick={() => actions.addChildTask(taskId)}
          >
            ＋ 子タスクを追加
          </button>
        )}
      </footer>

      {confirmingDelete && (
        <ConfirmDialog
          title={`「${task.name}」を削除しますか？`}
          messages={[
            // 子があるときは件数を出す（SPEC 3.2：「子タスク3件も一緒に削除されます」）
            ...(descendantCount > 0 ? [`子タスク${descendantCount}件も一緒に削除されます。`] : []),
            '削除しても、元に戻す（Ctrl+Z）で戻せます。',
          ]}
          confirmLabel="削除"
          onCancel={() => setConfirmingDelete(false)}
          // 削除すると、開いていたタスクがなくなるので、ストアがパネルを閉じる
          onConfirm={() => actions.deleteTask(taskId)}
        />
      )}
    </aside>
  );
}

// ---------------------------------------------------------------------------
// 1. 上部（6-3）
// ---------------------------------------------------------------------------

function PanelHeader({
  task,
  row,
  phaseName,
  prevId,
  nextId,
}: {
  task: Task;
  row: ScheduleRow;
  phaseName: string;
  prevId: string | null;
  nextId: string | null;
}) {
  const openTask = useAppStore((state) => state.actions.openTask);
  const updateTask = useAppStore((state) => state.actions.updateTask);

  /**
   * タスク名の欄に打った文字を反映する。
   * 空（空白だけ）は反映せず、欄を離れたら前の名前に戻す（決定事項66。PJT名と同じ決まり）
   */
  const handleName = (text: string, editSession: string): string | null => {
    if (text.trim() === '' || text === task.name) return null;
    updateTask(task.id, { name: text }, editSession);
    return text;
  };

  return (
    <header className={styles.header}>
      <div className={styles.headerTop}>
        <div className={styles.meta}>
          <span className={styles.metaId}>{row.label}</span>
          <span>{phaseName}</span>
        </div>
        {/* 前後のタスクへ（決定事項64）。その向きにタスクがなければ押せない */}
        <button
          type="button"
          className={styles.iconButton}
          aria-label="前のタスク"
          disabled={prevId === null}
          onClick={() => openTask(prevId)}
        >
          <ChevronUpIcon />
        </button>
        <button
          type="button"
          className={styles.iconButton}
          aria-label="次のタスク"
          disabled={nextId === null}
          onClick={() => openTask(nextId)}
        >
          <ChevronDownIcon />
        </button>
        <button
          type="button"
          className={styles.closeButton}
          aria-label="閉じる"
          onClick={() => openTask(null)}
        >
          <CloseIcon />
        </button>
      </div>

      <DraftInput
        className={styles.nameInput}
        aria-label="タスク名"
        value={task.name}
        onDraft={handleName}
      />

      {/* 状態の札はいつも出す。期日超過なら「期日超過」も並べる（決定事項65） */}
      <div className={styles.chips}>
        <span className={STATUS_CHIP_CLASS[row.status]}>{row.status}</span>
        {row.overDue && (
          <span className={chips.chipOverdue}>
            <FireIcon className={styles.fire} size={12} decorative />
            期日超過
          </span>
        )}
      </div>
    </header>
  );
}

// ---------------------------------------------------------------------------
// 3. 工数・進捗率・残工数・進捗バー（6-5）
// ---------------------------------------------------------------------------

function EffortSection({ task, row }: { task: Task; row: ScheduleRow }) {
  const updateTask = useAppStore((state) => state.actions.updateTask);
  const progress = rowProgressPct(row);

  // 一覧の欄（BoardRow.tsx）と同じ決まり。正しい値で、今と違うときだけ反映する
  const handleEffort = (text: string, editSession: string): string | null => {
    const effortTenths = parseEffortInput(text);
    if (effortTenths === null || effortTenths === row.effortTenths) return null;
    updateTask(task.id, { effortTenths }, editSession);
    return formatTenths(effortTenths);
  };
  const handleProgress = (text: string, editSession: string): string | null => {
    const progressPct = parseProgressInput(text);
    if (progressPct === null || progressPct === row.progressPct) return null;
    updateTask(task.id, { progressPct }, editSession);
    return String(progressPct);
  };

  const isOver = row.status === '超過';

  return (
    <>
      <section className={styles.grid3}>
        {row.leaf ? (
          <>
            <label className={styles.field}>
              工数（人日）
              <DraftInput
                className={styles.valueInput}
                inputMode="decimal"
                value={formatTenths(row.effortTenths)}
                onDraft={handleEffort}
              />
            </label>
            <label className={styles.field}>
              進捗率（%）
              <DraftInput
                className={styles.valueInput}
                inputMode="numeric"
                value={String(row.progressPct)}
                onDraft={handleProgress}
              />
            </label>
          </>
        ) : (
          // 親は子から集計した値（決定事項67）。編集できないので、入力欄ではなく文字で出す
          <>
            <ReadonlyField label="工数（自動）" value={formatTenths(row.effortTenths)} />
            <ReadonlyField label="進捗率（自動）" value={`${progress}%`} />
          </>
        )}
        <ReadonlyField label="残工数（自動）" value={formatTenths(row.remainingTenths)} />
      </section>

      <div>
        <div className={styles.progressLabel}>
          <span>進捗</span>
          <span className={styles.numeric}>
            {formatTenths(doneTenths(row))} / {formatTenths(row.effortTenths)} 人日
          </span>
        </div>
        {/* 進捗バー。色は一覧の進捗ラインと同じ（末端は青、親はグレー、超過は赤） */}
        <div
          className={styles.progressTrack}
          role="progressbar"
          aria-label="進捗"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress}
        >
          <div
            className={cx(
              styles.progressFill,
              !row.leaf && styles.progressFillParent,
              isOver && styles.progressFillOver,
            )}
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </>
  );
}

/** 編集できない値の欄（DESIGN.md の field-readonly） */
function ReadonlyField({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.field}>
      {label}
      <div className={styles.readonlyValue}>{value}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 4. 優先度・期日（6-6）
// ---------------------------------------------------------------------------

function PriorityAndDue({ task, isLeaf }: { task: Task; isLeaf: boolean }) {
  const updateTask = useAppStore((state) => state.actions.updateTask);
  // 「優先度」の文字を、ボタンの組の名前として読み上げに伝えるための id
  const priorityLabelId = useId();

  /** 期日の欄。空にしたら期日なし（null）。それ以外は、正しい日付（2026〜2050年）のときだけ反映する */
  const handleDue = (text: string, editSession: string): string | null => {
    const due = text === '' ? null : parseDateInput(text);
    if (text !== '' && due === null) return null;
    if (due === task.due) return null;
    updateTask(task.id, { due }, editSession);
    return due ?? '';
  };

  return (
    <section className={styles.grid2}>
      {/* 親は優先度を出さない（決定事項67。一覧と Excel でも、親の優先度は出していないため） */}
      {isLeaf && (
        <div className={styles.field}>
          {/* ボタンの組には label 要素を使えないので、見出しの文字と role="group" の名前でつなぐ */}
          <span id={priorityLabelId}>優先度</span>
          <div className={styles.priorityGroup} role="group" aria-labelledby={priorityLabelId}>
            {PRIORITIES.map((priority) => {
              const button = PRIORITY_BUTTONS[priority];
              const selected = task.priority === priority;
              return (
                <button
                  key={priority}
                  type="button"
                  className={cx(styles.priorityButton, selected && button.selected)}
                  aria-label={button.name}
                  aria-pressed={selected}
                  onClick={() => {
                    // 同じ優先度を押しても何も変わらないので、履歴を増やさないよう呼ばない
                    if (!selected) updateTask(task.id, { priority });
                  }}
                >
                  {button.mark}
                </button>
              );
            })}
          </div>
        </div>
      )}
      <label className={styles.field}>
        期日
        <DraftInput
          className={styles.dateInput}
          type="date"
          min={DATE_MIN}
          max={DATE_MAX}
          value={task.due ?? ''}
          onDraft={handleDue}
        />
      </label>
    </section>
  );
}

// ---------------------------------------------------------------------------
// 5. 日程（6-7）
// ---------------------------------------------------------------------------

/** 終了日の色のクラス（決定事項68）。超過は赤、間に合えば緑、それ以外は色なし */
const END_TONE_CLASS = {
  over: styles.endOver,
  onTime: styles.endOnTime,
  none: undefined,
} as const;

function ScheduleTable({
  normalRow,
  overtimeRow,
  overtimeShown,
  projectEnd,
}: {
  normalRow: ScheduleRow;
  overtimeRow: ScheduleRow;
  overtimeShown: boolean;
  projectEnd: string | null;
}) {
  // 通常と残業の2行。表示中のモードには「（表示中）」を付ける（決定事項68）
  const modes = [
    { name: '通常 8h', row: normalRow, shown: !overtimeShown },
    { name: '残業 10h', row: overtimeRow, shown: overtimeShown },
  ];
  // 見出しの文字を、表の名前として読み上げに伝えるための id
  const labelId = useId();
  /** 日付を「12/31(木)」の形で出す。日程がなければ「—」 */
  const dateText = (date: string | null) => (date === null ? '—' : formatMonthDayWeekday(date));

  return (
    <section>
      <div className={styles.sectionLabel} id={labelId}>
        日程（自動計算）
      </div>
      <table className={styles.scheduleTable} aria-labelledby={labelId}>
        <thead>
          <tr>
            <th scope="col">モード</th>
            <th scope="col">開始</th>
            <th scope="col">終了</th>
          </tr>
        </thead>
        <tbody>
          {modes.map((mode) => (
            <tr key={mode.name}>
              <th scope="row">
                {mode.name}
                {mode.shown && '（表示中）'}
              </th>
              <td>{dateText(mode.row.startDate)}</td>
              <td className={cx(styles.endCell, END_TONE_CLASS[endTone(mode.row, projectEnd)])}>
                {dateText(mode.row.endDate)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

// ---------------------------------------------------------------------------
// 6. 工程と親タスクの付け替え（6-8）
// ---------------------------------------------------------------------------

function MoveSection({
  taskId,
  phaseId,
  parentId,
  labelOf,
}: {
  taskId: string;
  phaseId: PhaseId;
  parentId: string | null;
  labelOf: (taskId: string) => string | undefined;
}) {
  const project = useAppStore(selectActiveProject);
  const moveTask = useAppStore((state) => state.actions.moveTask);

  // 移せる先（決まりは core/tree.ts の listMoveTargets）。そのうち今の工程の中の親タスクを選択肢にする
  const options = parentOptions(listMoveTargets(project, taskId), phaseId, labelOf);

  return (
    <section className={styles.grid2}>
      <label className={styles.field}>
        工程
        {/* 別の工程を選ぶと、その工程の直下の末尾へ移る */}
        <select
          className={styles.select}
          value={phaseId}
          onChange={(event) =>
            moveTask(taskId, { phaseId: event.target.value as PhaseId, parentId: null })
          }
        >
          {PHASES.map((phase) => (
            <option key={phase.id} value={phase.id}>
              {phase.name}
            </option>
          ))}
        </select>
      </label>
      <label className={styles.field}>
        親タスク
        {/* option の value は文字なので、工程の直下（null）は '' で表す */}
        <select
          className={styles.select}
          value={parentId ?? ''}
          onChange={(event) =>
            moveTask(taskId, {
              phaseId,
              parentId: event.target.value === '' ? null : event.target.value,
            })
          }
        >
          {options.map((option) => (
            <option key={option.parentId ?? ''} value={option.parentId ?? ''}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    </section>
  );
}

// ---------------------------------------------------------------------------
// 7. メモ（6-9）
// ---------------------------------------------------------------------------

function MemoField({ task }: { task: Task }) {
  const updateTask = useAppStore((state) => state.actions.updateTask);

  // メモはどんな文字でもよいので、今と違えばそのまま反映する
  const handleMemo = (text: string, editSession: string): string | null => {
    if (text === task.memo) return null;
    updateTask(task.id, { memo: text }, editSession);
    return text;
  };

  return (
    <label className={styles.field}>
      メモ
      <DraftTextarea className={styles.memo} rows={4} value={task.memo} onDraft={handleMemo} />
    </label>
  );
}
