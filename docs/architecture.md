# Tsumikiri 技術設計（architecture.md）

最終更新：2026-11-23
状態：**確定（2026-11-21）**

SPEC.md が「何を作るか」、このファイルは「どう作るか（技術）」、DESIGN.md は「どう見せるか（見た目）」を書く。食い違ったら SPEC.md を正とする。

---

## 1. 技術構成

| 項目 | 内容 | 状態 |
|---|---|---|
| 言語・UI | TypeScript + React | 決定（SPEC 6章） |
| ビルド | Vite。vite-plugin-singlefile で1つのHTMLにまとめ、`base: './'` にする | 決定（SPEC 6章） |
| Excel出力 | ExcelJS | 決定（SPEC 6章） |
| 祝日 | @holiday-jp/holiday_jp（2050年までのデータを同梱） | 決定（SPEC 6章） |
| Node.js のバージョン | 26系（その時点の最新。手元・CI とも同じにする） | 決定 |
| React のバージョン | 19 | 決定 |
| 状態管理 | Zustand（React の外からも読み書きでき、Ctrl+Z・保存・Excel出力を素直に書ける。必要な値だけを購読でき、保存の機能にバージョンと移行の仕組みがある） | 決定 |
| ドラッグ | dnd-kit（入れ子の並べ替えとキーボード操作に対応） | 決定 |
| スタイル | CSS Modules ＋ 色などは CSS 変数（追加のライブラリなし） | 決定 |
| テスト | Vitest | 決定 |
| 画面のテスト | Playwright Test（ブラウザで画面を開き、表示と操作を確かめる） | 決定 |
| 静的チェック | ESLint（typescript-eslint、react-hooks）＋ Prettier | 決定 |

## 2. フォルダ構成

```
src/
  core/            計算とデータ操作。React に依存しない純粋な関数だけを置く
    types.ts         データの型
    calendar.ts      稼働日の暦（土日・祝日・休業日）
    schedule.ts      日程の計算と集計
    tree.ts          タスクの追加・削除・移動・並べ替え
    sample.ts        サンプルPJT（開いた日に合わせて日付をずらす）
    storage.ts       保存形式の検証とバージョン移行
  excel/           Excel出力（ExcelJS でブックを組み立てる）
  store/           Zustand のストア、元に戻す履歴、localStorage への保存
  ui/              画面のコンポーネント
    tokens.css       DESIGN.md のトークンを CSS 変数にしたもの
  main.tsx
tests/             core と excel のテスト（docs/test-cases.md の例を元にする）
e2e/               画面のテスト（Playwright Test）
```

- 依存の向きは `ui → store → core`、`excel → core` の一方向にする。core は React も DOM も使わない
- 計算は core に閉じ込め、Vitest で画面なしに確かめられるようにする

## 3. データの流れ

```
AppData（保存するデータ）
   │  ストアが持つ。変更は「操作」を通してだけ行う
   ▼
schedule(project, daysOff, 8 or 10)   ← core の純粋な関数
   │  表示中のPJTについて、通常と残業の両方を計算する
   ▼
行の一覧（ScheduleRow[]）と、カード用の集計
   ▼
画面（タスク表・ガント・カード・詳細パネル）
```

- 計算結果は保存しない。データが変わるたびに作り直す。PJTとモードが同じなら、前回の結果と比べて開始日・終了日が変わった行を「ハイライト対象」にする（SPEC 3.1）
- 「今日」は、使う計算（カード用の集計 `summarizeCards`）の引数として渡す。テストで日付を固定できるようにするため。日程そのもの（`schedule`）は今日に左右されない

## 4. データの型

型は `src/core/types.ts` に置く。メモリの形と保存する形の2種類を持つ（決定 2026-11-23）。

- **メモリの形**（`AppData` など）：アプリが動いている間に使う。工数と進捗率を整数で持ち、計算で小数の誤差が出ないようにする（5章）
- **保存する形**（`SavedAppData` など）：localStorage とバックアップファイルに書く。SPEC 7章のとおり小数で持つ
- 2つの形の変換は `core/storage.ts` の2つの関数だけで行い、ほかの場所では変換しない。変換が散らばると、変換し忘れたところで誤差が出るため

```ts
type DateString = string;  // 'YYYY-MM-DD'
type Priority = 'high' | 'mid' | 'low';
type PhaseId = 'req' | 'design' | 'impl' | 'test' | 'release';
type Status = '完了' | '進行中' | '未着手' | '超過';

// メモリの形
interface Task {
  id: string;
  name: string;
  effortTenths: number;  // 工数。0.1人日単位の整数（3.5人日 → 35）。末端だけが使う
  progressPct: number;   // 進捗率。0〜100 の整数。末端だけが使う
  priority: Priority;
  due: DateString | null;
  memo: string;
  children: Task[];
}
interface Phase { id: PhaseId; name: string; tasks: Task[] }   // 5本で固定
interface Project { id: string; name: string; start: DateString; end: DateString | null; overtime: boolean; phases: Phase[] }
interface DayOff { date: DateString; label: string }
interface AppData { version: number; activeId: string; projects: Project[]; daysOff: DayOff[] }

// 保存する形。工数・進捗率だけが違い、ほかの項目はメモリの形と同じ
interface SavedTask extends Omit<Task, 'effortTenths' | 'progressPct' | 'children'> {
  effort: number;    // 人日の小数（3.5）
  progress: number;  // 0〜1 の小数（0.6）
  children: SavedTask[];
}
// SavedPhase・SavedProject・SavedAppData も同じように、tasks・phases・projects を保存する形に置き換える

// 変換（core/storage.ts。段階2の 2-9 で作る）
function fromSaved(saved: unknown): { ok: true; data: AppData } | { ok: false; reason: string };
function toSaved(data: AppData): SavedAppData;
```

- `fromSaved` は、形を検証してから `Math.round(effort × 10)`・`Math.round(progress × 100)` で整数にする。古いバージョンからの移行もここで行う。壊れていれば読み込まずに理由を返す
- `toSaved` は、`effortTenths ÷ 10`・`progressPct ÷ 100` で小数に戻す
- 日付はすべて `'YYYY-MM-DD'` の文字列で持つ。タイムゾーンのずれを避けるため、計算でも `Date` は使い捨てにする
- エンド日は空欄があり得るので `string | null`（SPEC 3.1）
- 工程の id は固定の値（`req` `design` `impl` `test` `release`）にする
- タスクの id は自前の短いランダム文字列にする（`crypto.randomUUID` は `file://` で使えない場合があるため）
- 開閉の状態（折りたたみ）は、データとは別に「表示の状態」として持ち、保存しない（SPEC 3.1）

計算結果の行：

```ts
interface ScheduleRow {
  key: string;          // タスクまたは工程の id
  kind: 'phase' | 'task';
  label: string;        // '1-2-1'
  level: number;        // 工程 0、親 1、子 2、孫 3
  leaf: boolean;
  start: number | null; // 開始位置。0.1時間単位の整数（5章）。タスクのない工程・親は null
  end: number | null;
  startDate: DateString | null;
  endDate: DateString | null;
  effortTenths: number;    // 0.1人日単位の整数。親・工程は子の合計
  progressPct: number;     // 末端は整数。親・工程は単純平均なので小数のまま
  remainingTenths: number; // 残工数。0.1人日単位の整数
  status: Status;
  overDue: boolean;     // 期日超過
}
```

## 5. 計算（core/schedule.ts）

ルールは SPEC 5章のとおり。実装の要点：

1. 開始日から数えた稼働日に 0, 1, 2… と番号を振る（calendar.ts）
2. 工程 → タスクの順に深さ優先でたどり、末端だけを `長さ = 工数 × 8 ÷ 1日の稼働時間` で直列に積む
3. 開始日 = `floor(開始位置)` 番目の稼働日。終了日 = `ceil(終了位置) − 1` 番目の稼働日
4. 親と工程は、子の最早開始〜最遅終了。工数は子の合計、進捗率は直下の子の単純平均（SPEC 4章）
5. 状態と期日超過を判定する。エンド日が空欄なら「超過」は付けない

決めておく端のケース（test-cases.md で例を作る）：
- 工数 0 のタスク：長さ 0。開始日と終了日はどちらも、その位置を含む稼働日にする
- タスクのない工程・親：日程なし（バーなし、日付は空欄）。進捗率の平均には入れない
- 開始日が休日：最初の稼働日から積む

### 小数の計算誤差を避ける（決定 2026-11-23）

JavaScript の数値は2進数の小数なので、`0.1 + 0.2` は `0.30000000000000004` になる。工数を小数のまま積むと、合計がちょうど1日にならず（`0.9999…` や `1.0000…1`）、`ceil` で終了日が1日ずれるおそれがある（test-cases.md の TC-18）。

位置の計算は整数だけで行う。
- 工数は 0.1人日単位の整数として扱う（3.5人日 → 35）
- 位置と長さは 0.1時間単位の整数にする。長さ = 工数（0.1人日単位）× 8。1日の長さは、通常 80、残業 100
- 開始日 = `floor(開始位置 ÷ 1日の長さ)`、終了日 = `ceil(終了位置 ÷ 1日の長さ) − 1`。割り算は整数同士なので誤差が出ない
- 画面に出すときだけ人日に戻す。保存する形（SPEC 7章の `effort: 3.5`）は変えず、読み込んだときに `Math.round(effort × 10)` で整数にする

進捗率・残工数・バーの塗り分けも、整数で扱う。
- 進捗率は 0〜100 の整数（1%刻み）で持つ。保存する形（`progress: 0.6`）は変えず、読み込んだときに `Math.round(progress × 100)` で整数にする
- 末端の残工数 ＝ 工数（0.1人日単位）×（100 − 進捗率）で、0.001人日単位の整数になる。これを 0.1人日に四捨五入する（`Math.floor((x + 50) / 100)`）。親・工程・全体は、四捨五入した値の合計にする
- 親・工程・全体の進捗率（単純平均）は、小数のまま持つ。日付の計算には使わないので、誤差があっても日付はずれない。「100% か」「0% より大きいか」の判定も、すべての子が 100 のときだけ平均がちょうど 100 になり、どれかの子が 0 より大きいときだけ平均が 0 より大きくなるので、正しく出る
- 親・工程・全体の進捗率の表示は、四捨五入した整数%にする。100%未満なら最大 99%、0%より大きければ最小 1% にする（SPEC 4章）
- バーの塗り分け（画面・Excel 共通、SPEC 3.1）：1日1マス。稼働日 d のうちバーがかかる部分 `[max(開始位置, d の始まり), min(終了位置, d の終わり))` の真ん中が、境目（`開始位置 + 長さ × 進捗率`）より前なら完了分、そうでなければ残り（ちょうど同じなら残り）。境目は `開始位置 + 長さ × 進捗率 ÷ 100` で求める。画面と Excel は同じ関数を使う

## 6. 状態管理と元に戻す

- ストアは「保存するデータ（AppData）」と「表示の状態（開いているタスク、折りたたみ、ハイライト）」を分けて持つ
- 元に戻すの履歴は、AppData の変更前の版を積む（上限100件）。変更は不変更新で行うので、版同士で変わっていない部分は共有され、メモリは増えにくい
- 同じ欄への続けての入力（1秒以内）は、履歴の1件にまとめる。1文字ごとに戻らないようにするため
- 表示の状態は履歴に入れない
- 入力欄にカーソルがあるときの Ctrl+Z は、ブラウザ標準の「入力欄の元に戻す」に任せる

## 7. 保存

- localStorage のキーは `tsumikiri:data`。中身は保存する形（`SavedAppData`）の JSON
- Zustand の `persist` で保存する。変更してから 300ms 後にまとめて書き込む
- `persist` は、書き込むときに `toSaved`、読み込むときに `fromSaved` を通す（4章）。通さないと、メモリの形（整数）のまま保存されてしまう
- `version` を持たせ、形が変わったときは storage.ts で古い形から移行する
- バックアップファイルも同じ形（`SavedAppData`）の JSON。読み込むときは形を検証し、壊れていれば読み込まずに理由を表示する
- 容量不足などで保存に失敗したら、画面に知らせる（データは画面上に残る）
- 初めて開いたとき（保存データがないとき）は、サンプルPJTを作る（SPEC 3.1）

## 8. 画面の構成

```
App
├─ ProjectTabs        PJTタブ（追加・並べ替え・「…」メニュー）
├─ ProjectHeader      PJT名・開始日・エンド日／休業日・有給、バックアップ、Excel出力
├─ SummaryCards       総工数・エンド日・完了予定（通常／残業）
├─ Toolbar            モード切り替え・＋タスク追加・凡例
├─ Board              タスク表＋ガント（見出しは上に固定、タスク表は左に固定）
│   ├─ BoardHeader      列見出し／月・曜日・日付
│   └─ BoardRow         1行＝左のカードと右の日付セル
├─ DetailPanel        詳細パネル
├─ DaysOffDialog      休業日・有給の一覧
└─ ConfirmDialog      削除・上書きの確認
```

- ガントは1日1セルで描く（画面案と同じ）。1行は、左に固定したカード（幅820px）と、日付のセルを横に並べた形にする
- 行は id をキーにし、`React.memo` で変わった行だけを描き直す。100行×100日程度なら仮想スクロールはいらない
- 縦の固定（見出し）と横の固定（タスク表）は、どちらも CSS の `position: sticky` で行う
- 見た目（色・文字・寸法・部品）は DESIGN.md に従う。トークンは `ui/tokens.css` に CSS 変数として置き、CSS Modules からはその変数だけを参照する。変数名は DESIGN.md のトークン名から作る（例：`colors.primary` → `--color-primary`、`spacing.layout.day-width` → `--spacing-layout-day-width`）
- Excel出力の色は、同じ DESIGN.md のトークンを excel/ から TypeScript の定数として参照する（CSS 変数は使えないため）。DESIGN.md から定数を作る方法は、実装の段階で決める

## 9. Excel出力（excel/）

- 画面と同じ計算結果（ScheduleRow）から、ExcelJS でブックを組み立てる。シートは通常と残業の2枚（SPEC 3.3）
- 画面案②の構成：

| 項目 | 内容 |
|---|---|
| 列幅（px換算） | ID 48 / 工程・タスク 182 / 優先 40 / 工数 52 / 進捗 52 / 残工数 56 / 開始 84 / 終了 84 / 期日 84 / 状態 64、日付 14 |
| 行 | 1行目タイトル、2行目条件、3行目月、4行目 列見出し＋日、5行目曜日、6行目からタスク |
| バー | 1日1セルを塗る。完了分か残りかは、画面と同じ決まりで決める（5章） |
| 字下げ | 階層ごとに全角スペース |
| 色 | DESIGN.md の Colors（Excel出力）のトークンを使う。エンド日の列の右は `end-line` の線 |

- 6行目、K列（日付の始まり）でウィンドウ枠を固定する
- ファイル名は `工数ガント_<PJT名>_<出力日>.xlsx`
- ダウンロードは Blob とリンクのクリックで行う（`file://` でも動く）

## 10. テスト・ビルド・公開

- **テスト**：core と excel を Vitest で確かめる。日程計算は docs/test-cases.md の例をそのままテストにする
- **画面のテスト**：Playwright Test で、開発サーバーの画面と、ビルドした `dist/index.html`（`file://`）を開いて確かめる。画面の大きさは 1512 × 982（等倍）。表示されるもの・操作した結果など、コマンドで確かめられることはここに書く
- **人が見る確認**：画面案との見比べ（色・寸法）は、テストにせず人が見る。web-design-guidelines の skill でもレビューする
- **ビルド**：`npm run build` で `dist/index.html` が1つできる。これを PC に置けばそのまま使える
- **公開**：GitHub Actions で、`main` に入ったらテストとビルドを行い、GitHub Pages に公開する。PR ではテストとビルドだけを行う
