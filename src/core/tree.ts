/**
 * タスクの木の操作（tasks.md 段階2：2-1〜2-7）
 *
 * PJT・タスクを作る、追加する、削除する、並べ替える、付け替える、項目を変える、を行う。
 *
 * ■ どの関数も「元のデータを書き換えない」
 * 引数で受け取った Project には手を入れず、変更を入れた新しい Project を返す（不変更新）。
 * - 変わっていない工程やタスクは、元のオブジェクトをそのまま使い回す。
 *   そのため、版をいくつ持ってもメモリはあまり増えない。
 * - 段階3の「元に戻す」は、変更前の Project をそのまま履歴に積むだけでよくなる。
 * - React も「オブジェクトが別物になったか」で再描画を決めるので、相性がよい。
 *
 * ■ できない操作は「何もしない」
 * 孫より深くなる追加や、自分の子孫の下への移動などを頼まれたときは、
 * 例外を投げずに、受け取った Project をそのまま返す。
 * 画面では、そもそもそういう操作を選べないようにする（listMoveTargets など）。
 * 「返ってきた Project が元と同じオブジェクトなら、何も変わっていない」と判定できる。
 *
 * React にも DOM にも依存しない（architecture.md 2章）。
 */

import type { DateString, Phase, PhaseId, Priority, Project, Task } from './types';

// ---------------------------------------------------------------------------
// 決まった値
// ---------------------------------------------------------------------------

/**
 * 5本の工程。並び順もこのとおりで固定（SPEC 4章）。
 * 名前の変更・追加はしないので、ここに1か所だけ書いておく。
 */
export const PHASES: readonly { id: PhaseId; name: string }[] = [
  { id: 'req', name: '要件定義' },
  { id: 'design', name: '設計' },
  { id: 'impl', name: '実装' },
  { id: 'test', name: 'テスト' },
  { id: 'release', name: 'リリース' },
];

/**
 * タスクの階層の深さの上限。親 1、子 2、孫 3（工程は 0）。
 * 孫より深くはしない（SPEC 3.2・4章）。
 */
export const MAX_LEVEL = 3;

/** 新しいPJTの名前（SPEC 3.1、決定事項36） */
export const NEW_PROJECT_NAME = '新しいPJT';

/** 新しいタスクの名前（SPEC 3.1、決定事項37） */
export const NEW_TASK_NAME = '新しいタスク';

// ---------------------------------------------------------------------------
// id を作る
// ---------------------------------------------------------------------------

/** id を作る関数の型。テストでは、決まった id を順に返す関数に差し替える */
export type IdGenerator = () => string;

/**
 * 短いランダムな id を作る（例：'k3x9q0a2mz'）。
 *
 * crypto.randomUUID は「安全な接続（https や localhost）」でしか使えず、
 * file:// で開いたときに使えない場合がある（architecture.md 4章）。
 * crypto.getRandomValues はどこでも使えるので、こちらで乱数を作る。
 *
 * 1文字あたり 36 通り（0-9 と a-z）× 10文字なので、およそ 3.6 × 10^15 通り。
 * 個人のアプリで作るタスクの数なら、重なる心配はまずない。
 */
export function newId(): string {
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  // 1バイト（0〜255）を 36 で割った余りを、0-9a-z の1文字にする。
  // 余りの出方にわずかな偏りがあるが、暗号に使うわけではないので問題ない。
  return Array.from(bytes, (b) => (b % 36).toString(36)).join('');
}

// ---------------------------------------------------------------------------
// 2-1 新しいPJTとタスクを作る
// ---------------------------------------------------------------------------

/**
 * 新しいタスクを作る。初期値は SPEC 3.1（決定事項37）のとおり。
 * - 名前「新しいタスク」、工数 1.0（= 10）、進捗率 0%、優先度 mid、期日なし、メモなし
 *
 * fields で一部の項目を上書きできる（サンプルPJTを作るときなどに使う）。
 */
export function createTask(makeId: IdGenerator = newId, fields: Partial<Task> = {}): Task {
  return {
    id: makeId(),
    name: NEW_TASK_NAME,
    effortTenths: 10,
    progressPct: 0,
    priority: 'mid',
    due: null,
    memo: '',
    children: [],
    ...fields,
  };
}

/**
 * 新しいPJTを作る。5本の工程は空のまま用意する。
 * - 名前は「新しいPJT」、開始日は今日、エンド日は空欄（SPEC 3.1）
 * - 「今日」は引数で受け取る。テストで日付を固定できるようにするため（architecture.md 3章）
 */
export function createProject(today: DateString, makeId: IdGenerator = newId): Project {
  return {
    id: makeId(),
    name: NEW_PROJECT_NAME,
    start: today,
    end: null,
    overtime: false,
    phases: PHASES.map((p) => ({ id: p.id, name: p.name, tasks: [] })),
  };
}

// ---------------------------------------------------------------------------
// 木をたどる・書き換えるための下請けの関数
// ---------------------------------------------------------------------------

/**
 * タスクが木のどこにあるか。
 * - parentId：親タスクの id。工程の直下なら null
 * - index：兄弟の中で何番目か（0 から）
 * - level：階層。親 1、子 2、孫 3
 */
export interface TaskLocation {
  phaseId: PhaseId;
  parentId: string | null;
  index: number;
  level: number;
  task: Task;
}

/**
 * id からタスクを探し、その場所を返す。見つからなければ null。
 *
 * 深さ優先でたどる。タスクの数は多くても数百なので、毎回たどっても十分速い。
 */
export function findTask(project: Project, taskId: string): TaskLocation | null {
  // 再帰で兄弟の並びを調べる。見つかったらその場所を返し、なければ null
  const search = (
    phaseId: PhaseId,
    tasks: Task[],
    parentId: string | null,
    level: number,
  ): TaskLocation | null => {
    for (let index = 0; index < tasks.length; index++) {
      const task = tasks[index]!;
      if (task.id === taskId) {
        return { phaseId, parentId, index, level, task };
      }
      const found = search(phaseId, task.children, task.id, level + 1);
      if (found) return found;
    }
    return null;
  };

  for (const phase of project.phases) {
    const found = search(phase.id, phase.tasks, null, 1);
    if (found) return found;
  }
  return null;
}

/**
 * ある場所の「兄弟の並び」だけを書き換えた、新しい Project を返す。
 * - parentId が null なら、その工程の直下のタスクの並び（phase.tasks）
 * - parentId があれば、その親タスクの子の並び（task.children）
 *
 * 書き換える並びまでの道筋にあるオブジェクトだけを作り直し、
 * ほかの工程・タスクは元のものをそのまま使う（不変更新）。
 *
 * 書き換える先が見つからなければ、元の Project をそのまま返す。
 */
function updateSiblings(
  project: Project,
  phaseId: PhaseId,
  parentId: string | null,
  update: (siblings: Task[]) => Task[],
): Project {
  // 親タスクの id を探しながら、子の並びを書き換える。
  // 見つからなかった枝では、元の配列をそのまま返す（=== で比べて変わっていないと分かる）
  const updateIn = (tasks: Task[]): Task[] => {
    let changed = false;
    const next = tasks.map((task) => {
      if (task.id === parentId) {
        changed = true;
        return { ...task, children: update(task.children) };
      }
      const children = updateIn(task.children);
      if (children === task.children) return task;
      changed = true;
      return { ...task, children };
    });
    return changed ? next : tasks;
  };

  let changed = false;
  const phases = project.phases.map((phase): Phase => {
    if (phase.id !== phaseId) return phase;
    const tasks = parentId === null ? update(phase.tasks) : updateIn(phase.tasks);
    if (tasks === phase.tasks) return phase;
    changed = true;
    return { ...phase, tasks };
  });
  return changed ? { ...project, phases } : project;
}

/** 1つのタスクだけを書き換えた、新しい Project を返す。見つからなければ元のまま */
function updateTaskById(project: Project, taskId: string, update: (task: Task) => Task): Project {
  const loc = findTask(project, taskId);
  if (!loc) return project;
  return updateSiblings(project, loc.phaseId, loc.parentId, (siblings) =>
    siblings.map((t, i) => (i === loc.index ? update(t) : t)),
  );
}

/**
 * タスクとその子孫が、何段の高さを持つか。
 * - 末端だけなら 1、子を持てば 2、孫まであれば 3
 *
 * 移動や子の追加で、孫より深くならないかを確かめるのに使う。
 */
function subtreeHeight(task: Task): number {
  let max = 0;
  for (const child of task.children) {
    max = Math.max(max, subtreeHeight(child));
  }
  return 1 + max;
}

// ---------------------------------------------------------------------------
// 2-2 タスクの追加
// ---------------------------------------------------------------------------

/**
 * 工程の末尾にタスクを追加する（SPEC 3.1：工程の帯からの追加、「＋タスク追加」）。
 * 追加するタスクは、呼ぶ側で createTask で作って渡す。
 * 画面ではこのあと、追加したタスクの詳細パネルを開く（task.id を使う）。
 */
export function addTaskToPhase(project: Project, phaseId: PhaseId, task: Task): Project {
  return updateSiblings(project, phaseId, null, (siblings) => [...siblings, task]);
}

/**
 * 「＋タスク追加」の追加先の工程を決める（SPEC 3.1、決定事項10）。
 * - 詳細パネルで開いているタスクがあれば、そのタスクと同じ工程
 * - 開いていなければ（または見つからなければ）、最初の工程（要件定義）
 */
export function phaseForNewTask(project: Project, openTaskId: string | null): PhaseId {
  if (openTaskId !== null) {
    const loc = findTask(project, openTaskId);
    if (loc) return loc.phaseId;
  }
  return PHASES[0]!.id;
}

/**
 * 子を追加できるか。孫（level 3）には子を足せない（SPEC 3.2、決定事項12）。
 * 画面では、これが false なら「＋子タスクを追加」を出さない。
 */
export function canAddChild(project: Project, parentId: string): boolean {
  const loc = findTask(project, parentId);
  return loc !== null && loc.level < MAX_LEVEL;
}

/**
 * タスクの子として、末尾にタスクを追加する（SPEC 3.2）。
 *
 * ■ 2-3 工数・進捗率の引き継ぎ（SPEC 3.2、決定事項22、TC-35）
 * 末端のタスク（まだ子がない）に子を足すと、そのタスクは「親」になり、
 * 工数・進捗率は子から集計した値を使うようになる。
 * そのままだと、入力してあった工数が画面から消えてしまうので、
 * 最初の子に、親の工数・進捗率をそのまま引き継ぐ。
 * こうすると親の集計値（子の合計・平均）も元の値と同じになり、日程も変わらない。
 *
 * 親自身の effortTenths・progressPct は消さずに残す（types.ts の Task のコメント参照）。
 * 親になった後は集計に使わないので、残っていても表示や日程には影響しない。
 *
 * 孫に子を足そうとしたとき、親が見つからないときは、何もしない。
 */
export function addChildTask(project: Project, parentId: string, task: Task): Project {
  const loc = findTask(project, parentId);
  if (!loc || loc.level >= MAX_LEVEL) return project;

  const parent = loc.task;
  // 親がまだ末端なら、これが「最初の子」。親の工数・進捗率を引き継ぐ
  const child: Task =
    parent.children.length === 0
      ? { ...task, effortTenths: parent.effortTenths, progressPct: parent.progressPct }
      : task;

  return updateSiblings(project, loc.phaseId, parentId, (siblings) => [...siblings, child]);
}

// ---------------------------------------------------------------------------
// 2-4 タスクの削除
// ---------------------------------------------------------------------------

/**
 * タスクの子孫（子・孫）の数を数える。自分は数えない。
 * 削除の確認で「子タスク3件も一緒に削除されます」と出すのに使う（SPEC 3.2）。
 * 見つからなければ 0。
 */
export function countDescendants(project: Project, taskId: string): number {
  const loc = findTask(project, taskId);
  if (!loc) return 0;
  const count = (task: Task): number =>
    task.children.reduce((sum, child) => sum + 1 + count(child), 0);
  return count(loc.task);
}

/**
 * タスクを削除する。子・孫もまとめて消える（SPEC 3.2）。
 * 元に戻す（Ctrl+Z）は、段階3のストアで変更前の版に戻すことで行う。
 *
 * ■ 子がなくなった親（SPEC 3.2、決定事項42、TC-39）
 * 親の最後の子を消すと、その親は末端に戻る。
 * そのときの工数・進捗率は 0 にする。
 * 親には「子を足す前に入れていた値」が残っているが、子を編集した後では意味のない古い値なので使わない。
 * 消えた子の値を引き継ぐのも、子がもういないのに不自然なので、しない。
 *
 * 別の親へ移す（moveTask）ときも、この関数で今の場所から取り除くので、同じ扱いになる。
 */
export function deleteTask(project: Project, taskId: string): Project {
  const loc = findTask(project, taskId);
  if (!loc) return project;
  const removed = updateSiblings(project, loc.phaseId, loc.parentId, (siblings) =>
    siblings.filter((t) => t.id !== taskId),
  );

  // 工程の直下のタスクを消したときは、親タスクがないので、ここで終わり
  if (loc.parentId === null) return removed;

  // 親の子がこれでなくなったなら、親を「工数 0・進捗率 0 の末端」にする
  const parent = findTask(removed, loc.parentId);
  if (parent && parent.task.children.length === 0) {
    return updateTaskById(removed, loc.parentId, (task) => ({
      ...task,
      effortTenths: 0,
      progressPct: 0,
    }));
  }
  return removed;
}

// ---------------------------------------------------------------------------
// 2-5 同じ階層の中での並べ替え
// ---------------------------------------------------------------------------

/**
 * タスクを、同じ兄弟の中の別のタスクの位置へ動かす（SPEC 3.1、TC-42）。
 * 子・孫はタスクの中に入っているので、親を動かすと子もまとめて動く。
 *
 * 引数は「動かすタスク」と「落とした先のタスク」の id。
 * ドラッグの部品（dnd-kit）が、この2つの id を教えてくれるので、その形に合わせている。
 * - 下へ動かすとき：落とした先のタスクの「後ろ」に入る
 * - 上へ動かすとき：落とした先のタスクの「前」に入る
 * （配列から取り出して、落とした先の番号へ差し込む。dnd-kit の arrayMove と同じ動き）
 *
 * 2つが兄弟でない（別の親・別の工程）なら、何もしない（SPEC 3.1：同じ階層の中だけ）。
 */
export function reorderTask(project: Project, taskId: string, overTaskId: string): Project {
  if (taskId === overTaskId) return project;
  const from = findTask(project, taskId);
  const over = findTask(project, overTaskId);
  if (!from || !over) return project;
  // 同じ工程の、同じ親の下にいるときだけ動かせる
  if (from.phaseId !== over.phaseId || from.parentId !== over.parentId) return project;

  return updateSiblings(project, from.phaseId, from.parentId, (siblings) => {
    const next = [...siblings];
    const [moved] = next.splice(from.index, 1);
    next.splice(over.index, 0, moved!);
    return next;
  });
}

// ---------------------------------------------------------------------------
// 2-6 工程・親タスクの付け替え
// ---------------------------------------------------------------------------

/**
 * 付け替えの移せる先。
 * - parentId が null なら、その工程の直下
 * - parentId があれば、その親タスクの子の末尾
 */
export interface MoveTarget {
  phaseId: PhaseId;
  parentId: string | null;
  /** 画面の選択肢に出す名前。工程の直下なら工程の名前、親タスクならタスクの名前 */
  name: string;
  /** 移せる先の階層。工程の直下 0、親タスク 1、子タスク 2 */
  level: number;
}

/**
 * タスクを移せる先の一覧を作る（SPEC 3.2、決定事項38）。
 * 工程の順、木の上から順に並べる。今いる場所も含める（画面の選択肢で、今の値として選ばれた状態にするため）。
 *
 * 移せる先の決まり：
 * - 工程の直下は、どの工程でも移せる
 * - タスクの下へは、すでに子を持つ親タスクにだけ移せる（末端の下には移せない）
 * - 自分と自分の子孫の下には移せない（木が輪になってしまうため）
 * - 移した後に孫より深くなる先は選べない
 *   例：子を持つタスク（高さ 2）は、子タスク（level 2）の下に入れると孫の下にひ孫ができるので不可
 */
export function listMoveTargets(project: Project, taskId: string): MoveTarget[] {
  const loc = findTask(project, taskId);
  if (!loc) return [];
  const height = subtreeHeight(loc.task);
  const targets: MoveTarget[] = [];

  // 親タスクの候補を、木の上から順に集める
  const collect = (phaseId: PhaseId, tasks: Task[], level: number) => {
    for (const task of tasks) {
      // 自分の下（子孫を含む）は、まるごと候補から外す
      if (task.id === taskId) continue;
      // 移した後の深さ：自分は level + 1 の段に入り、そこから height 段ぶん下へ伸びる
      const fits = level + height <= MAX_LEVEL;
      if (task.children.length > 0 && fits) {
        targets.push({ phaseId, parentId: task.id, name: task.name, level });
      }
      collect(phaseId, task.children, level + 1);
    }
  };

  for (const phase of project.phases) {
    // 工程の直下（level 1 に入る）は、高さが 3 以下なら必ず入る
    targets.push({ phaseId: phase.id, parentId: null, name: phase.name, level: 0 });
    collect(phase.id, phase.tasks, 1);
  }
  return targets;
}

/**
 * タスクを、別の工程・別の親タスクへ移す（SPEC 3.2）。移した先の末尾に入る。
 * 子・孫も一緒に移る。
 *
 * listMoveTargets に入っていない先を指定されたら、何もしない。
 * 今いる親と同じ先を指定されたときも、何もしない（並び順も変えない）。
 */
export function moveTask(
  project: Project,
  taskId: string,
  target: { phaseId: PhaseId; parentId: string | null },
): Project {
  const loc = findTask(project, taskId);
  if (!loc) return project;
  if (loc.phaseId === target.phaseId && loc.parentId === target.parentId) return project;

  // 決まりに合う先かどうかは、一覧と同じ関数で確かめる（決まりを2か所に書かないため）
  const allowed = listMoveTargets(project, taskId).some(
    (t) => t.phaseId === target.phaseId && t.parentId === target.parentId,
  );
  if (!allowed) return project;

  // 1. 今の場所から取り除く
  const removed = deleteTask(project, taskId);
  // 2. 移した先の末尾に足す。自分の子孫の下には移さないので、取り除いた後も移した先は残っている
  return updateSiblings(removed, target.phaseId, target.parentId, (siblings) => [
    ...siblings,
    loc.task,
  ]);
}

// ---------------------------------------------------------------------------
// 2-7 タスクの項目の更新
// ---------------------------------------------------------------------------

/** 画面から変えられるタスクの項目 */
export type TaskPatch = Partial<
  Pick<Task, 'name' | 'effortTenths' | 'progressPct' | 'priority' | 'due' | 'memo'>
>;

/** 優先度の一覧。値が正しいかを確かめるのに使う（storage.ts の読み込みでも使う） */
export const PRIORITIES: readonly Priority[] = ['high', 'mid', 'low'];

/**
 * タスクの項目を変える（名前・工数・進捗率・優先度・期日・メモ）。
 *
 * 値は、ここで正しい範囲に直してから入れる。
 * 画面の入力欄でも範囲を決めるが、データの守りは core に置いておく。
 * - 工数：0 以上の整数（0.1人日単位）。小数や負の数は、四捨五入・0 に直す
 * - 進捗率：0〜100 の整数（SPEC 3.1：1%刻み）
 * - 優先度：high / mid / low 以外は無視する
 *
 * 親タスクの工数・進捗率は、子から集計するので変えられない（SPEC 3.1：親は自動）。
 * 親に工数・進捗率を渡しても、その2つは無視する。
 */
export function updateTask(project: Project, taskId: string, patch: TaskPatch): Project {
  return updateTaskById(project, taskId, (task) => {
    const next: Task = { ...task };
    const isLeaf = task.children.length === 0;

    if (patch.name !== undefined) next.name = patch.name;
    if (patch.memo !== undefined) next.memo = patch.memo;
    if (patch.due !== undefined) next.due = patch.due;
    if (patch.priority !== undefined && PRIORITIES.includes(patch.priority)) {
      next.priority = patch.priority;
    }
    if (isLeaf && patch.effortTenths !== undefined && Number.isFinite(patch.effortTenths)) {
      next.effortTenths = Math.max(0, Math.round(patch.effortTenths));
    }
    if (isLeaf && patch.progressPct !== undefined && Number.isFinite(patch.progressPct)) {
      next.progressPct = Math.min(100, Math.max(0, Math.round(patch.progressPct)));
    }
    return next;
  });
}
