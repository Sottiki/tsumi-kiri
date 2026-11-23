/**
 * 日程の計算と集計（tasks.md 1-4〜1-10、SPEC 4章・5章、architecture.md 5章）
 *
 * PJTのデータ（Project）から、画面とExcelに出す「行の一覧（ScheduleRow[]）」と、
 * カード・ガント・警告に必要な値を作る。どれも React に依存しない純粋な関数で、
 * 同じ入力からは必ず同じ結果を返す（計算結果は保存せず、データが変わるたびに作り直す）。
 *
 * ■ 位置の単位（小数の誤差を避ける。architecture.md 5章）
 * タスクの位置と長さは「PJTの開始日から数えた時間」で、0.1時間単位の整数で持つ。
 * - 工数 1 人日 = 8 時間 = 80（0.1時間単位）。工数は 0.1 人日単位の整数（effortTenths）なので、
 *   長さ = effortTenths × 8 になる（例：3.5人日 → 35 × 8 = 280 = 28時間）
 * - 1日の長さは、通常 8h で 80、残業 10h で 100
 * - 位置 p を含む稼働日の番号は floor(p ÷ 1日の長さ)
 * 整数どうしの足し算・掛け算だけで位置を積むので、0.1 を10回足しても 1 からずれない（TC-18）。
 * 割り算も、割り切れるときは JavaScript でも必ずちょうどの整数になるので、floor・ceil で日がずれない。
 */

import {
  WorkCalendar,
  WorkdayNumbering,
  addDays,
  formatMonthDay,
  formatMonthDayWeekday,
} from './calendar';
import type {
  BarCell,
  DateString,
  DayOff,
  FinishForecast,
  GanttDay,
  HoursPerDay,
  Phase,
  Project,
  ScheduleRow,
  Status,
  SummaryCards,
  Task,
  Warning,
} from './types';

// ---------------------------------------------------------------------------
// 1日の稼働時間
// ---------------------------------------------------------------------------

/** 1日の長さ（0.1時間単位）。8時間 → 80、10時間 → 100 */
export function dayLength(hoursPerDay: HoursPerDay): number {
  return hoursPerDay * 10;
}

/** 工数（0.1人日単位）から、タスクの長さ（0.1時間単位）を出す。1人日 = 8時間なので × 8 */
function taskLength(effortTenths: number): number {
  return effortTenths * 8;
}

// ---------------------------------------------------------------------------
// 1-4〜1-7：行の一覧を作る
// ---------------------------------------------------------------------------

/** 計算の途中で持ち回る値。タスクをたどりながら、積んだ位置を進めていく */
interface ScheduleContext {
  project: Project;
  numbering: WorkdayNumbering;
  dayLen: number;
  /** 次の末端タスクが始まる位置（0.1時間単位）。末端を1つ積むたびに、その長さだけ進む */
  cursor: number;
}

/**
 * PJTの日程を計算し、画面に出す順の行の一覧を返す。
 *
 * 行の順番は「工程1、そのタスク（深さ優先）、工程2、…」。親の行は、子の行より前に置く。
 * 末端のタスクだけを、上から順に開始日からすき間なく直列に積む（SPEC 5章）。
 * 工程も上から順に直列に積むので、工程をまたいでも位置はそのまま続く（TC-34）。
 *
 * @param project 計算するPJT
 * @param daysOff 休業日・有給の一覧（全PJT共通）
 * @param hoursPerDay 1日の稼働時間（通常 8 ／ 残業 10）
 */
export function schedule(
  project: Project,
  daysOff: readonly DayOff[],
  hoursPerDay: HoursPerDay,
): ScheduleRow[] {
  const ctx: ScheduleContext = {
    project,
    numbering: new WorkdayNumbering(new WorkCalendar(daysOff), project.start),
    dayLen: dayLength(hoursPerDay),
    cursor: 0,
  };

  const rows: ScheduleRow[] = [];
  project.phases.forEach((phase, phaseIndex) => {
    // 工程の ID は 1〜5。タスクがなくても番号を持つ（TC-41）
    rows.push(...schedulePhase(phase, String(phaseIndex + 1), ctx));
  });
  return rows;
}

/** 工程1本ぶんの行（工程の行 ＋ その下のタスクの行）を作る */
function schedulePhase(phase: Phase, label: string, ctx: ScheduleContext): ScheduleRow[] {
  const taskRows: ScheduleRow[] = [];
  // 工程の直下のタスクの行。工程の集計には、直下の子だけを使う（孫は子の集計に含まれている）
  const directChildren: ScheduleRow[] = [];

  phase.tasks.forEach((task, taskIndex) => {
    const rowsOfTask = scheduleTask(task, `${label}-${taskIndex + 1}`, 1, ctx);
    // scheduleTask は、そのタスク自身の行を先頭にして返す
    directChildren.push(rowsOfTask[0] as ScheduleRow);
    taskRows.push(...rowsOfTask);
  });

  const summary = summarizeChildren(directChildren);
  const phaseRow: ScheduleRow = {
    key: phase.id,
    kind: 'phase',
    label,
    level: 0,
    leaf: false,
    ...summary,
    status: decideStatus(summary.progressPct, summary.endDate, ctx.project.end),
    // 工程には期日がないので、期日超過は付かない
    overDue: false,
  };
  return [phaseRow, ...taskRows];
}

/**
 * タスク1件ぶんの行を作る。子があれば、子・孫の行も続けて返す。
 * 返す配列の先頭は、必ずこのタスク自身の行。
 *
 * @param label 画面に出す ID（'1-2-1'）。並び順から作る（1-7）
 * @param level 階層。親 1、子 2、孫 3
 */
function scheduleTask(
  task: Task,
  label: string,
  level: number,
  ctx: ScheduleContext,
): ScheduleRow[] {
  if (task.children.length === 0) {
    return [scheduleLeaf(task, label, level, ctx)];
  }

  // 親：先に子を（上から順に）積んでから、その結果を集計する
  const descendantRows: ScheduleRow[] = [];
  const directChildren: ScheduleRow[] = [];
  task.children.forEach((child, childIndex) => {
    const rowsOfChild = scheduleTask(child, `${label}-${childIndex + 1}`, level + 1, ctx);
    directChildren.push(rowsOfChild[0] as ScheduleRow);
    descendantRows.push(...rowsOfChild);
  });

  const summary = summarizeChildren(directChildren);
  const parentRow: ScheduleRow = {
    key: task.id,
    kind: 'task',
    label,
    level,
    leaf: false,
    ...summary,
    status: decideStatus(summary.progressPct, summary.endDate, ctx.project.end),
    overDue: isOverDue(summary.progressPct, summary.endDate, task.due),
  };
  return [parentRow, ...descendantRows];
}

/** 末端のタスクを、今の位置（ctx.cursor）に積む */
function scheduleLeaf(task: Task, label: string, level: number, ctx: ScheduleContext): ScheduleRow {
  const start = ctx.cursor;
  const end = start + taskLength(task.effortTenths);
  // 次のタスクは、このタスクが終わった位置から続けて始まる（日の途中でも、すき間を空けない）
  ctx.cursor = end;

  // 開始日 = 開始位置を含む稼働日 = floor(開始位置 ÷ 1日の長さ) 番目
  const startDayIndex = Math.floor(start / ctx.dayLen);
  // 終了日 = 終了位置を含む稼働日 = ceil(終了位置 ÷ 1日の長さ) − 1 番目。
  // 終了位置はその日の「終わりの時刻」なので、ちょうど日の境目（80 など）で終わるタスクは、
  // 次の日ではなくその日のうちに終わったことにする（そのために ceil して 1 を引く）。
  // ただし工数 0 のタスクは長さがないので、開始日と同じ「その位置を含む稼働日」にする（TC-16）。
  const endDayIndex = end === start ? startDayIndex : Math.ceil(end / ctx.dayLen) - 1;

  const startDate = ctx.numbering.dateOf(startDayIndex);
  const endDate = ctx.numbering.dateOf(endDayIndex);

  return {
    key: task.id,
    kind: 'task',
    label,
    level,
    leaf: true,
    start,
    end,
    startDate,
    endDate,
    effortTenths: task.effortTenths,
    progressPct: task.progressPct,
    remainingTenths: leafRemainingTenths(task.effortTenths, task.progressPct),
    status: decideStatus(task.progressPct, endDate, ctx.project.end),
    overDue: isOverDue(task.progressPct, endDate, task.due),
  };
}

// ---------------------------------------------------------------------------
// 1-5：集計
// ---------------------------------------------------------------------------

/**
 * 末端の残工数（0.1人日単位）。工数 ×（1 − 進捗率）を 0.1 人日に四捨五入する（SPEC 3.1）。
 *
 * effortTenths × (100 − progressPct) は 0.001 人日単位の整数になる
 * （例：3.5人日・進捗 33% → 35 × 67 = 2345 = 2.345人日）。
 * これを 100 で割って 0.1 人日単位に戻すときに四捨五入する。
 * 50 を足してから切り捨てると、整数だけで四捨五入できる（2345 + 50 = 2395 → 23 = 2.3人日。TC-36）。
 */
export function leafRemainingTenths(effortTenths: number, progressPct: number): number {
  return Math.floor((effortTenths * (100 - progressPct) + 50) / 100);
}

/** 親・工程・PJT全体の行のうち、子から集計して決まる項目 */
type Summary = Pick<
  ScheduleRow,
  'start' | 'end' | 'startDate' | 'endDate' | 'effortTenths' | 'progressPct' | 'remainingTenths'
>;

/**
 * 直下の子の行から、親（または工程）の値を集計する（SPEC 4章）。
 * - 工数・残工数：子の合計（残工数は、末端で四捨五入した値を足していく。TC-36）
 * - 期間：子の一番早い開始から、一番遅い終了まで
 * - 進捗率：直下の子の進捗率の単純平均（工数で重み付けはしない。TC-31）。
 *   子が親なら、その子の値（すでに平均したもの）を使う（TC-32）
 *
 * 子がない（タスクのない工程）なら、日程なし・工数 0・進捗 0 になる（TC-33）。
 */
function summarizeChildren(children: readonly ScheduleRow[]): Summary {
  // 日程のある子だけで期間と進捗率を出す。
  // タスクの行はどれも日程を持つので、ここで外れるのは PJT全体の集計でのタスクのない工程だけ（TC-33）
  const scheduled = children.filter((row) => row.start !== null);

  let effortTenths = 0;
  let remainingTenths = 0;
  for (const row of children) {
    effortTenths += row.effortTenths;
    remainingTenths += row.remainingTenths;
  }

  if (scheduled.length === 0) {
    return {
      start: null,
      end: null,
      startDate: null,
      endDate: null,
      effortTenths,
      progressPct: 0,
      remainingTenths,
    };
  }

  let start = Infinity;
  let end = -Infinity;
  let startDate: DateString | null = null;
  let endDate: DateString | null = null;
  let progressSum = 0;
  for (const row of scheduled) {
    // filter で start !== null の行だけにしてあるので、start・end・日付はすべて入っている
    start = Math.min(start, row.start as number);
    end = Math.max(end, row.end as number);
    // 日付は 'YYYY-MM-DD' なので、文字列のまま比べれば日付の順になる
    if (startDate === null || (row.startDate as DateString) < startDate) {
      startDate = row.startDate;
    }
    if (endDate === null || (row.endDate as DateString) > endDate) {
      endDate = row.endDate;
    }
    progressSum += row.progressPct;
  }

  return {
    start,
    end,
    startDate,
    endDate,
    effortTenths,
    // 小数のまま持つ。表示するときに displayProgressPct で整数%にする（architecture.md 5章）
    progressPct: progressSum / scheduled.length,
    remainingTenths,
  };
}

/**
 * 親・工程・PJT全体の進捗率を、画面に出す整数%にする（SPEC 4章、TC-38）。
 * 四捨五入するが、100%未満なら最大 99%、0%より大きければ最小 1% にする。
 * 「100%（完了）と出ているのに状態が進行中」のような食い違いを防ぐため。
 *
 * 末端の進捗率（もともと整数）を渡しても、そのままの値が返る。
 */
export function displayProgressPct(progressPct: number): number {
  const rounded = Math.round(progressPct);
  if (progressPct < 100 && rounded > 99) {
    return 99;
  }
  if (progressPct > 0 && rounded < 1) {
    return 1;
  }
  return rounded;
}

// ---------------------------------------------------------------------------
// 1-6：状態と期日超過
// ---------------------------------------------------------------------------

/**
 * 状態を判定する（SPEC 5章）。上から順に見て、最初に当てはまったものにする。
 * 1. 進捗率が 100% なら「完了」（エンド日を超えていても赤くしない。TC-22）
 * 2. 終了日がエンド日より後なら「超過」。エンド日が空欄なら、この判定はしない（TC-21）
 * 3. 進捗率が 0% より大きければ「進行中」
 * 4. それ以外は「未着手」
 *
 * 親・工程の進捗率は小数の平均だが、平均がちょうど 100 になるのは子がすべて 100 のときだけなので、
 * `=== 100` で正しく判定できる（architecture.md 5章）。
 */
function decideStatus(
  progressPct: number,
  endDate: DateString | null,
  projectEnd: DateString | null,
): Status {
  if (progressPct === 100) {
    return '完了';
  }
  if (projectEnd !== null && endDate !== null && endDate > projectEnd) {
    return '超過';
  }
  if (progressPct > 0) {
    return '進行中';
  }
  return '未着手';
}

/**
 * 期日超過か（SPEC 5章）。終了日が期日より後なら true。
 * 期日と同じ日に終わるなら超えていない（TC-19）。完了したタスクには付けない（TC-24）。
 */
function isOverDue(
  progressPct: number,
  endDate: DateString | null,
  due: DateString | null,
): boolean {
  if (progressPct === 100 || due === null || endDate === null) {
    return false;
  }
  return endDate > due;
}

// ---------------------------------------------------------------------------
// 1-8：カード用の集計
// ---------------------------------------------------------------------------

/**
 * PJT全体の集計（総工数カード、完了予定）。
 * 工程の行を「PJT全体の子」とみなして、親と同じ決まりで集計する。
 * タスクのない工程は日程がないので、進捗率の平均に入らない（TC-33）。
 */
function summarizeProject(rows: readonly ScheduleRow[]): Summary {
  return summarizeChildren(rows.filter((row) => row.kind === 'phase'));
}

/**
 * カード4枚の値を作る（1-8）。
 *
 * @param normalRows 通常 8h で計算した行（schedule(…, 8)）
 * @param overtimeRows 残業 10h で計算した行（schedule(…, 10)）
 * @param today 今日の日付。テストで固定できるよう、引数で受け取る（architecture.md 3章）
 */
export function summarizeCards(
  project: Project,
  daysOff: readonly DayOff[],
  normalRows: readonly ScheduleRow[],
  overtimeRows: readonly ScheduleRow[],
  today: DateString,
): SummaryCards {
  const calendar = new WorkCalendar(daysOff);
  const normal = summarizeProject(normalRows);
  const overtime = summarizeProject(overtimeRows);

  /** 完了予定日から、エンド日を何営業日超えるかを出す */
  const forecast = (finishDate: DateString | null): FinishForecast => ({
    finishDate,
    overrunWorkdays:
      finishDate === null || project.end === null
        ? null
        : calendar.countWorkingDays(project.end, finishDate),
  });

  return {
    // 工数と残工数は、通常と残業で変わらない（変わるのは日程だけ）
    totalEffortTenths: normal.effortTenths,
    remainingTenths: normal.remainingTenths,
    progressPct: normal.progressPct,
    endDate: project.end,
    workdaysUntilEnd: project.end === null ? null : calendar.countWorkingDays(today, project.end),
    normal: forecast(normal.endDate),
    overtime: forecast(overtime.endDate),
    shortenedWorkdays:
      normal.endDate === null || overtime.endDate === null
        ? null
        : calendar.countWorkingDays(overtime.endDate, normal.endDate),
  };
}

// ---------------------------------------------------------------------------
// 1-9：ガントの表示期間とバーの塗り分け
// ---------------------------------------------------------------------------

/**
 * ガントに出す日を、開始日から順に並べる（SPEC 3.1）。
 *
 * 表示する期間は、開始日から「エンド日と完了予定日（通常 8h）の遅い方」の1週間後まで（TC-06）。
 * どちらかが空なら、ある方の1週間後まで。どちらもなければ開始日の1週間後まで（TC-29）。
 * 「1週間後」は稼働日ではなく、暦の上で7日後。
 *
 * @param normalRows 通常 8h で計算した行。表示する期間は、残業モードでも通常の完了予定で決める
 */
export function listGanttDays(
  project: Project,
  daysOff: readonly DayOff[],
  normalRows: readonly ScheduleRow[],
): GanttDay[] {
  const calendar = new WorkCalendar(daysOff);
  const numbering = new WorkdayNumbering(calendar, project.start);
  const finishDate = summarizeProject(normalRows).endDate;

  // エンド日と完了予定日のうち、あるものの中で一番遅い日。どちらもなければ開始日
  let latest = project.start;
  for (const date of [project.end, finishDate]) {
    if (date !== null && date > latest) {
      latest = date;
    }
  }
  const lastDate = addDays(latest, 7);

  const days: GanttDay[] = [];
  for (let date = project.start; date <= lastDate; date = addDays(date, 1)) {
    const kind = calendar.dayKind(date);
    days.push({
      date,
      kind,
      workdayIndex: kind === 'work' ? numbering.indexOf(date) : null,
    });
  }
  return days;
}

/**
 * 1行のバーを、1日1マスに分けて返す（SPEC 3.1。画面とExcelで共通に使う）。
 *
 * - 日の途中で始まる・終わる日も、その日のマスを丸ごと塗る（工数 1.1 なら2マス。TC-27）
 * - 完了分と残りの塗り分けも1マス単位。その日にバーがかかる部分の真ん中が、
 *   完了分と残りの境目（開始位置 ＋ 長さ × 進捗率）より前なら完了分、そうでなければ残り。
 *   ちょうど境目と同じなら残り（TC-25）
 * - 日程のない行（タスクのない工程）と、長さ 0 のタスク（工数0）はバーを描かないので、空の配列を返す（TC-16）
 *
 * 親・工程の行にも使える（期間は子の最早開始〜最遅終了、進捗率は子の平均）。
 *
 * @param hoursPerDay その行を計算したときの1日の稼働時間。row の位置の単位を日に直すのに使う
 */
export function barCells(row: ScheduleRow, hoursPerDay: HoursPerDay): BarCell[] {
  if (row.start === null || row.end === null || row.end === row.start) {
    return [];
  }
  const dayLen = dayLength(hoursPerDay);
  const { start, end } = row;
  const length = end - start;

  const firstDay = Math.floor(start / dayLen);
  const lastDay = Math.ceil(end / dayLen) - 1;

  const cells: BarCell[] = [];
  for (let day = firstDay; day <= lastDay; day += 1) {
    // この日のうち、バーがかかる部分 [segmentStart, segmentEnd)
    const segmentStart = Math.max(start, day * dayLen);
    const segmentEnd = Math.min(end, (day + 1) * dayLen);

    // 「真ん中 < 境目」を、割り算を使わずに比べる。
    //   真ん中 = (segmentStart + segmentEnd) ÷ 2
    //   境目   = start + length × progressPct ÷ 100
    // 両辺に 200 を掛けると、
    //   (segmentStart + segmentEnd) × 100 < start × 200 + length × progressPct × 2
    // 末端の進捗率は整数なので、両辺とも整数になり、誤差なく比べられる。
    // 親・工程の行では進捗率が小数の平均なので、右辺は整数にならない。
    // その場合でも誤差は非常に小さく、ちょうど境目に重なるときにだけ結果が変わりうる。
    const middleTimes200 = (segmentStart + segmentEnd) * 100;
    const boundaryTimes200 = start * 200 + length * row.progressPct * 2;
    cells.push({ workdayIndex: day, done: middleTimes200 < boundaryTimes200 });
  }
  return cells;
}

// ---------------------------------------------------------------------------
// 1-10：詳細パネルの警告
// ---------------------------------------------------------------------------

/**
 * 詳細パネルの警告を作る（SPEC 3.2、TC-05・TC-28）。
 *
 * - 表示モードに関係なく、通常 8h の日程で判定し、2行目に残業 10h の結果を出す
 * - 期日超過の警告を先に、エンド日超過の警告を後に出す。両方を超えているときは、
 *   同じ日付でもまとめずにそれぞれ出す
 * - 完了したタスクは「超過」にも「期日超過」にもならないので、警告は出ない
 *
 * @param due そのタスクの期日（ScheduleRow には期日がないので、別に受け取る）
 * @param normalRow 通常 8h で計算した、そのタスクの行
 * @param overtimeRow 残業 10h で計算した、そのタスクの行
 */
export function buildWarnings(
  due: DateString | null,
  projectEnd: DateString | null,
  daysOff: readonly DayOff[],
  normalRow: ScheduleRow,
  overtimeRow: ScheduleRow,
): Warning[] {
  const calendar = new WorkCalendar(daysOff);
  const normalEnd = normalRow.endDate;
  const overtimeEnd = overtimeRow.endDate;
  if (normalEnd === null || overtimeEnd === null) {
    return [];
  }

  /** 1件の警告の文を組み立てる。limit は期日かエンド日 */
  const makeWarning = (kind: Warning['kind'], limit: DateString): Warning => {
    const limitName = kind === 'due' ? '期日' : 'エンド日';
    const overrun = calendar.countWorkingDays(limit, normalEnd);
    const title = `終了予定 ${formatMonthDayWeekday(normalEnd)} は${limitName} ${formatMonthDay(limit)} を ${overrun} 営業日超えています`;

    const overtimeOverrun = calendar.countWorkingDays(limit, overtimeEnd);
    const detail =
      overtimeOverrun === 0
        ? `残業 10h なら ${formatMonthDayWeekday(overtimeEnd)} に終わり、${limitName}に間に合います。`
        : `残業 10h でも ${formatMonthDayWeekday(overtimeEnd)} に終わり、${limitName}を ${overtimeOverrun} 営業日超えます。`;
    return { kind, title, detail };
  };

  const warnings: Warning[] = [];
  // overDue・status は、期日・エンド日の空欄や完了の扱いも含めて schedule で判定済みなので、それを使う
  if (normalRow.overDue && due !== null) {
    warnings.push(makeWarning('due', due));
  }
  if (normalRow.status === '超過' && projectEnd !== null) {
    warnings.push(makeWarning('end', projectEnd));
  }
  return warnings;
}
