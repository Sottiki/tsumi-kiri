---
version: alpha
name: Tsumikiri
description: 工数ガント（Tsumikiri）の見た目のルール。画面案（デザインキャンバス）の値を元にしている。
colors:
  # 青：操作と末端タスク
  primary: "#1D4ED8"
  primary-soft: "#9DB8F5"
  primary-container: "#E3ECFF"
  focus-row: "#EAF1FF"
  focus-ring: "rgba(29, 78, 216, 0.22)"
  link: "#2448B8"
  link-hover: "#17318A"
  # 基本
  background: "#F6F7F9"
  surface: "#FFFFFF"
  surface-subtle: "#FAFBFC"
  surface-muted: "#F4F5F7"
  surface-sunken: "#F7F8FA"
  button-quiet: "#F1F3F6"
  on-surface: "#1B1F27"
  on-surface-sub: "#5B6270"
  on-surface-faint: "#8A919E"
  border: "#E3E6EB"
  border-strong: "#D5D9E0"
  divider: "#EEF0F3"
  grid: "#F1F2F5"
  # グレー：工程と親タスク
  phase: "#64748B"
  on-phase: "#FFFFFF"
  phase-row: "#EEF1F6"
  phase-rest: "#A9B4C4"
  parent-card: "#F6F8FB"
  parent-border: "#D5DBE5"
  parent-done: "#475569"
  parent-rest: "#B4BCC9"
  tree-line: "#C3CAD6"
  badge: "#E6EBF3"
  # 状態
  error: "#B42318"
  error-soft: "#F4A39C"
  error-container: "#FDE8E8"
  error-card: "#FFF8F7"
  error-panel: "#FFF5F4"
  error-border: "#F4C7C3"
  on-error-panel: "#7A271A"
  end-line: "#D92D20"
  success: "#18794E"
  success-container: "#F2F8F4"
  success-border: "#BFDCC8"
  warning: "#B54708"
  warning-container: "#FFF1E6"
  fire: "#E8590C"
  done-container: "#EEF0F3"
  on-done: "#4B5563"
  # 暦
  day-off: "#F0F1F4"
  today: "#FFF6D6"
  today-head: "#FFE9A3"
  today-border: "#E8D9A0"
  flash: "#FFE58F"
  sunday: "#C4320A"
  saturday: "#2448B8"
  other-mode-line: "#64748B"
  # Excel出力
  excel-header: "#E8ECF4"
  excel-grid: "#E1E3E6"
  excel-day-off: "#EEF0F3"
  excel-parent-row: "#F7F8FA"
typography:
  app-title:
    fontFamily: Noto Sans JP
    fontSize: 17px
    fontWeight: 700
  panel-title:
    fontFamily: Noto Sans JP
    fontSize: 20px
    fontWeight: 700
  project-name:
    fontFamily: Noto Sans JP
    fontSize: 14px
    fontWeight: 600
  body-md:
    fontFamily: Noto Sans JP
    fontSize: 13px
    fontWeight: 400
  body-sm:
    fontFamily: Noto Sans JP
    fontSize: 12px
    fontWeight: 400
  label-md:
    fontFamily: Noto Sans JP
    fontSize: 11px
    fontWeight: 600
  label-sm:
    fontFamily: Noto Sans JP
    fontSize: 10px
    fontWeight: 600
  stat-value:
    fontFamily: Inter
    fontSize: 26px
    fontWeight: 600
  panel-value:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: 600
  numeric-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: 400
  numeric-xs:
    fontFamily: Inter
    fontSize: 10px
    fontWeight: 600
rounded:
  xs: 4px
  sm: 6px
  md: 8px
  lg: 10px
  panel: 15px
  full: 999px
spacing:
  2xs: 4px
  xs: 6px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 20px
  2xl: 24px
  layout:
    table-width: 820px
    indent-step: 22px
    row-phase: 34px
    row-task: 40px
    day-width: 22px
    header-row: 22px
    bar-leaf: 12px
    bar-parent: 6px
    progress-line: 3px
    panel-width: 460px
    panel-inset: 16px
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.surface}"
    rounded: "{rounded.sm}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.sm}"
  button-add-task:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.primary}"
    rounded: "{rounded.md}"
  button-danger:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.error}"
    rounded: "{rounded.sm}"
  icon-button:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface-sub}"
    rounded: "{rounded.sm}"
    size: 32px
  icon-button-close:
    backgroundColor: "{colors.button-quiet}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.sm}"
    size: 32px
  mode-toggle:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface-sub}"
    rounded: "{rounded.md}"
  mode-toggle-active:
    backgroundColor: "{colors.on-surface}"
    textColor: "{colors.surface}"
    rounded: "{rounded.md}"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    typography: "{typography.body-md}"
    rounded: "{rounded.sm}"
  input-table:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    typography: "{typography.numeric-sm}"
    rounded: "{rounded.xs}"
  field-readonly:
    backgroundColor: "{colors.surface-muted}"
    textColor: "{colors.on-surface}"
    typography: "{typography.panel-value}"
    rounded: "{rounded.sm}"
  stat-card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.lg}"
  stat-card-on-time:
    backgroundColor: "{colors.success-container}"
    textColor: "{colors.success}"
    rounded: "{rounded.lg}"
  stat-card-over:
    backgroundColor: "{colors.error-panel}"
    textColor: "{colors.error}"
    rounded: "{rounded.lg}"
  phase-band:
    backgroundColor: "{colors.phase}"
    textColor: "{colors.on-phase}"
    typography: "{typography.label-md}"
    rounded: "{rounded.sm}"
    height: 23px
  task-card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.md}"
    height: 34px
  task-card-parent:
    backgroundColor: "{colors.parent-card}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.md}"
    height: 34px
  task-card-over:
    backgroundColor: "{colors.error-card}"
    textColor: "{colors.error}"
    rounded: "{rounded.md}"
    height: 34px
  child-count-badge:
    backgroundColor: "{colors.badge}"
    textColor: "{colors.on-surface-sub}"
    typography: "{typography.label-sm}"
    rounded: "{rounded.full}"
  chip-done:
    backgroundColor: "{colors.done-container}"
    textColor: "{colors.on-done}"
    typography: "{typography.label-md}"
    rounded: "{rounded.full}"
  chip-in-progress:
    backgroundColor: "{colors.primary-container}"
    textColor: "{colors.primary}"
    typography: "{typography.label-md}"
    rounded: "{rounded.full}"
  chip-not-started:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface-sub}"
    typography: "{typography.label-md}"
    rounded: "{rounded.full}"
  chip-over:
    backgroundColor: "{colors.error-container}"
    textColor: "{colors.error}"
    typography: "{typography.label-md}"
    rounded: "{rounded.full}"
  chip-overdue:
    backgroundColor: "{colors.warning-container}"
    textColor: "{colors.warning}"
    typography: "{typography.label-md}"
    rounded: "{rounded.full}"
  priority-high:
    textColor: "{colors.error}"
  priority-mid:
    textColor: "{colors.warning}"
  priority-low:
    textColor: "{colors.on-surface-sub}"
  bar-leaf-done:
    backgroundColor: "{colors.primary}"
    height: 12px
  bar-leaf-rest:
    backgroundColor: "{colors.primary-soft}"
    height: 12px
  bar-parent-done:
    backgroundColor: "{colors.parent-done}"
    height: 6px
  bar-parent-rest:
    backgroundColor: "{colors.parent-rest}"
    height: 6px
  bar-phase-rest:
    backgroundColor: "{colors.phase-rest}"
    height: 6px
  bar-over-done:
    backgroundColor: "{colors.error}"
  bar-over-rest:
    backgroundColor: "{colors.error-soft}"
  detail-panel:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.panel}"
    width: 460px
  warning-box:
    backgroundColor: "{colors.error-panel}"
    textColor: "{colors.on-error-panel}"
    rounded: "{rounded.md}"
---

# Tsumikiri DESIGN.md

状態：**確定（2026-11-21）**。段階4で、点線の太さ・カードの2行目・空欄のときの表示・「休業日・有給」ボタンの置き方・画面案の細かい寸法の扱いを追加（2026-11-23）。段階5で、工程の帯の「＋」ボタンを追加（2026-11-23）。段階6で、緑の使い方に詳細パネルの日程の表を、Layout に詳細パネルを開いている間のガントの余白を、Components に詳細パネルの親タスク・優先度のボタン・前後のボタン・タスク名の欄・進捗バーと、確認ダイアログの見た目を追加（2026-11-24）

値は画面案（デザインキャンバス：① メイン画面、② Excel出力イメージ、③ 詳細パネル）から抜き出した。画面の動きや項目は SPEC.md、作り方は docs/architecture.md を参照。

## Overview

上司に「総工数」と「エンド日に間に合うか」を見せるための、業務用の落ち着いた画面。白い面を淡いグレーの背景に並べ、色は意味のあるところにだけ使う。

- 情報の密度は高め。1画面に表とガントを並べ、スクショ1枚で状況が伝わることを優先する
- 色の意味は固定する。青＝操作と末端タスク、グレー＝工程と親タスク、赤＝エンド日の超過、橙＝期日の超過、緑＝間に合う
- 骨格は、チームで使っているスプレッドシートのガントテンプレに寄せる。色はそれより見やすくする
- ライトモードのみ。PCのブラウザで使う

## Colors

トークンは上の YAML のとおり。役割ごとの使い方：

- **基本**：画面の背景は `background`、カード・表・パネルは `surface`。文字は `on-surface`、ラベルと補足は `on-surface-sub`。枠はカードとパネルが `border`、入力欄とボタンと表の区切りが `border-strong`
- **青（primary）**：主ボタン、末端タスクのバーの完了分、カード下端の進捗ライン、開いているタスクの枠。末端のバーの残りは `primary-soft`。開いているタスクのガントの行は `focus-row`、カードの外側には `focus-ring` を3px付ける
- **グレー（工程・親）**：工程の帯は `phase` に白文字。工程の行のガント側は `phase-row`。親カードは `parent-card` と `parent-border`。親・工程のバーは完了分 `parent-done`、残りは親 `parent-rest`、工程 `phase-rest`。ツリー線は `tree-line`
- **赤（error）**：エンド日を超えたものだけに使う。文字・バーの完了分・優先度 high・削除ボタンは `error`、バーの残りは `error-soft`。超過したタスクのカードは `error-card`、警告の枠と超過の完了予定カードは `error-panel` と `error-border`、警告の文章は `on-error-panel`
- **エンド日の線**：`end-line` の2pxの実線を、エンド日の列の右に引く
- **もう一方のモードの完了予定の線**：`other-mode-line` の1pxの点線（dashed）を、完了予定日の列の右に引く。エンド日の線と同じ列なら、エンド日の線を優先する
- **緑（success）**：エンド日に間に合うことを表すときだけに使う。完了予定がエンド日に間に合うときのカードと、詳細パネルの日程の表で、エンド日に間に合う終了日の文字（段階6で追加、2026-11-24）
- **橙（warning・fire）**：優先度 mid、「期日超過」の札、炎アイコン
- **暦**：土日祝の列は `day-off`、今日の列は `today`（日付の見出しは `today-head`）。日曜・祝日の文字は `sunday`、土曜の文字は `saturday`。日程が変わった終了日のハイライトは `flash`
- **Excel出力**：見出し `excel-header`、罫線 `excel-grid`、土日祝 `excel-day-off`、工程の行 `phase-row`、親の行 `excel-parent-row`。バーの色は画面と同じ（工程の残りも画面と同じ `phase-rest`）。エンド日を超えた末端の行の文字は `error`。工程・親は超過しても文字は `on-surface` のまま、バーだけ赤にする
  - Excel のセルには CSS 変数を使えないので、使う色を `src/excel/colors.ts` に書き写す。キーはトークン名と同じにし、DESIGN.md と同じ値かを Vitest（`tests/excel-colors.test.ts`）で確かめる。ここの色を変えたら、colors.ts も合わせる

## Typography

- 本文は **Noto Sans JP**。数字・日付・ID は **Inter** にして、桁をそろえて読みやすくする
- Google Fonts から読み込む。オフラインで開いたときは、システムの書体で表示されて良い
- 使い分け：

| トークン | 使う場所 |
|---|---|
| `app-title` | アプリ名 |
| `panel-title` | 詳細パネルのタスク名 |
| `project-name` | PJT名の入力欄 |
| `stat-value` | 上部カードの大きな数値 |
| `panel-value` | 詳細パネルの工数・進捗率・残工数 |
| `body-md` | 本文、入力欄、ボタン |
| `body-sm` | タスク名、カードの補足、警告の文章 |
| `label-md` | 入力欄のラベル、状態の札、列見出し |
| `label-sm` | ガントの見出し（月・曜日）、子の数の札 |
| `numeric-sm` | 表の中の ID・工数・進捗・日付 |
| `numeric-xs` | ガントの日付の見出し |

- 工程の帯の工程名は 12px の太字、字間 0.04em
- **Excel出力**：書体は **游ゴシック**（Windows・Mac の Office に標準で入っている。Noto Sans JP は上司の PC にないことがあるため）。文字の大きさは画面案②の px を pt にした値（× 0.75 を 0.5pt 刻み）にする

| 使う場所 | 画面案② | Excel |
|---|---|---|
| 1行目のタイトル（太字） | 14px | 10.5pt |
| 2行目の条件、タスク表 | 11px | 8pt |
| 3行目の月（太字） | 10px | 7.5pt |
| 4・5行目の日と曜日 | 9px | 7pt |
- 警告の文章は行の高さ 1.7

## Layout

- 画面は上から：PJTタブ → ヘッダ（PJT名・日付・ボタン） → 上部のカード4枚 → 操作の列（モード切り替え・＋タスク追加・凡例） → タスク表とガント
- 画面の左右の余白は `2xl`（24px）。カード同士の間は `md`（12px）
- 上部のカードは、最小220pxの列で折り返す
- タスク表とガントの枠は、画面の残りの高さいっぱいに広げ、その中だけを縦横にスクロールする（ヘッダ・カード・操作の列は動かさない）
- **タスク表**：幅は `layout.table-width`（820px）で左に固定する。列幅は ID 52 / 名前 可変 / 優先 44 / 工数 56 / 進捗 52 / 残工数 56 / 開始 54 / 終了 54 / 期日 54 / 状態 72（px）
- **行**：工程の行は `layout.row-phase`（34px）で、帯は上8px・下3px空ける。タスクの行は `layout.row-task`（40px）で、カードは上下3px空ける
- **階層の字下げ**：カードの左端は `12 + (階層 − 1) × 22` px（`layout.indent-step` = 22px）
- **ガント**：1日 `layout.day-width`（22px）。見出しは `layout.header-row`（22px）× 3段（月・曜日・日付）。バーは行の上下中央に置き、高さは末端 `layout.bar-leaf`（12px）、親と工程 `layout.bar-parent`（6px）。バーは1日1マス単位で描く。日の途中で始まる・終わる日も、その日の幅いっぱいに描く。完了分と残りの塗り分けも1日単位（SPEC 3.1）
- 見出しは縦にスクロールしても上に固定し、タスク表は横にスクロールしても左に固定する
- トークンにない細かい寸法（ボタン・カード・札の内側の余白、凡例の見本やアイコンの大きさ、ツリー線の太さ 1.5px など）は、画面案の値をそのまま使う。字の太さで画面案が 500 のところは 600 にそろえる（段階4で決定、2026-11-23）。画面案にない新しい値が要るときは、先にユーザーに確認する
- **詳細パネル**：幅 `layout.panel-width`（460px）。画面の上下と右に `layout.panel-inset`（16px）空けて浮かせる。パネルの内側の余白は左右20px
  - パネルを開いている間は、ガントの中身の右に `layout.panel-width` ＋ `layout.panel-inset` × 2 の余白を足す。終わり近くのバーも、パネルに隠れない所までスクロールできるようにするため（段階6で追加、2026-11-24）

## Elevation & Depth

影は控えめに使い、面の区別は主に背景色と枠線で行う。

- **タスクカード**：`0 1px 2px rgba(16, 24, 40, 0.06)`。開いているタスクだけ、代わりに `0 0 0 3px` の `focus-ring`
- **詳細パネル**：`0 16px 40px rgba(15, 23, 42, 0.18)`。背景は暗くしない
- 上部のカード、表の外枠、ダイアログ以外の面には影を付けない

## Shapes

| トークン | 値 | 使う場所 |
|---|---|---|
| `xs` | 4px | 表の中の入力欄、終了日のハイライト、工程の帯の「＋」 |
| `sm` | 6px | 入力欄、ボタン、工程の帯 |
| `md` | 8px | タスクカード、警告の枠、モード切り替え、＋タスク追加 |
| `lg` | 10px | 上部のカード、タスク表とガントの外枠 |
| `panel` | 15px | 詳細パネル |
| `full` | 999px | 状態の札、子の数の札、進捗バー |

アイコンは線のアイコン（線の太さ2〜2.5px）。炎アイコンだけは塗りにする。

## Motion

- **日程が変わったとき**：終了日の背景を `flash` にし、約1.5秒たったら0.8秒かけて元に戻す
- **詳細パネルを開いたとき**：そのタスクのバーが、パネルに隠れない範囲の中央に来るよう、横と縦をスクロールする
- そのほかの動きは付けない。OS で「視差効果を減らす」が有効なら、スクロールは即座に行う

## Voice & Content Strategy

- 画面の言葉は日本語。用語は SPEC.md にそろえる：工数（人日）、進捗率、残工数、エンド日、期日、完了予定、営業日、超過、期日超過
- **日付**：画面では `11/24(火)` か `11/24`。入力欄と Excel のセルでは `2026-11-24`
- **数値**：工数は小数1桁（`3.0`）、進捗は整数の％（`60%`）
- **決まった言い回し**：
  - 完了予定のカード：「エンド日に間に合う」／「エンド日を 5 営業日超過」／「残業なら 7 営業日短縮」／「エンド日未設定」／「タスクなし」
  - 値がないとき（エンド日が空欄のエンド日のカード、タスクがないときの完了予定）は「—」
  - 警告：「終了予定 1/4(月) は期日 12/25 を 5 営業日超えています」「残業 10h なら 12/23(水) に終わり、期日に間に合います。」
  - 削除の確認：「子タスク3件も一緒に削除されます」のように件数を出す
- 優先度は記号で表す：high `!!!`、mid `=`、low `-`

## Components

トークンは上の YAML のとおり。YAML に書けない部分：

- **ボタン**：`button-primary` と `button-secondary` は余白 9px 14〜16px、枠は `border-strong`（主ボタンは `primary`）。`button-danger` の枠は `error-border`。`button-add-task` の枠は `primary`
- **ヘッダのボタン**：右端に「休業日・有給」「バックアップ」（`button-secondary`）、「Excel出力」（`button-primary`）の順に並べる。「休業日・有給」は画面案にないので、「バックアップ」と同じ形にする
- **モード切り替え**：2つのボタンを `border-strong` の枠で囲む。選んでいる方が `mode-toggle-active`
- **入力欄**：枠は `border-strong`、余白 7〜8px 10px。表の中の数値の入力欄（`input-table`）は右寄せで、工数は幅46px、進捗は幅36px
- **上部のカード**：枠は `border`。数値の下に、補足を `body-sm` で1行。残業 10h のカードだけ、判定（間に合う／超過）の下の2行目に、短縮日数を `on-surface-sub` で添える。エンド日が空欄のときやタスクがないときは、完了予定のカードを白い `stat-card` にし、補足は `on-surface-sub` にする
- **工程の帯**：左から ID、工程名、工数、進捗、残工数、開始、終了。終了日は、超過したら `error` の背景に白文字
  - 工程名の右（`xs` 空ける）に、その工程にタスクを足す「＋」のボタンを常に出す。画面案にないので段階5で決めた（2026-11-23）。大きさ 18 × 18px、背景なし、角丸 `xs`。アイコンは 12px の線（太さ 2.5px）で `on-phase`
- **タスクカード**：枠は `border`（親は `parent-border`、超過は `error-border`。超過は親にも使う。開いているときは `primary`）。下端に進捗ライン（3px、末端は `primary`、親は `parent-done`、超過は `error`）。親は太字で、開閉マークと子の数の札を付ける。期日超過なら名前の前に炎アイコン、メモがあれば名前の後ろにメモのアイコン
- **状態の札**：`chip-not-started` だけは `border-strong` の内側の線を付ける
- **詳細パネル**：枠は `border`。上部（ID・工程・タスク名・札・移動と閉じるボタン）と下部（削除・＋子タスクを追加）は `divider` の線で区切り、下部の背景は `surface-subtle`
  - 親タスクのパネルでは、工数・進捗率・残工数を、どれも編集できない欄（`field-readonly`）で出す。ラベルは「工数（自動）」「進捗率（自動）」「残工数（自動）」（段階6で確認、2026-11-24）
  - 前後へ移るボタンは `icon-button` に `border-strong` の枠（画面案③のとおり）。先頭・末尾で押せないときは、アイコンを `on-surface-faint` にする（段階6で確認、2026-11-24）
  - タスク名の欄（`panel-title`）は、ふだんは枠なし・背景なしで見出しに見せる。マウスを乗せたときと入力中だけ `border-strong` の枠を出し、編集できることを伝える（段階6で確認、2026-11-24）
  - 進捗バーは高さ 8px・角丸 `full`、地は `badge`。色は一覧のカードの進捗ラインにそろえ、末端は `primary`、親は `parent-done`、エンド日の超過は `error`（段階6で確認、2026-11-24）
  - 優先度の3つのボタンは、`border-strong` の枠でつなげる。選んでいないボタンは `surface` の地に `on-surface-sub` の文字。選んだボタンは、high が `error-container` の地に `error`、mid が `warning-container` の地に `warning`、low が `surface-muted` の地に `on-surface`（段階6で確認、2026-11-24）
- **警告の枠**：枠は `error-border`。左に注意のアイコン、太字の1行目と、通常の2行目
- **凡例**：完了分、残り、エンド日超過、土日祝、今日、エンド日、期日超過の7つ

## Do's and Don'ts

- **Do**：色・文字・角丸・余白は、この DESIGN.md のトークンを使う。新しい値が必要になったら、先にここへ足してから使う
- **Do**：本文の文字は背景とのコントラスト比を 4.5:1 以上にする。`on-surface-faint` はアイコンにだけ使い、文字には使わない
- **Do**：見分ける必要のある色は、色合いだけでなく明るさも変える（例：バーの完了分と残り）
- **Do**：アイコンだけのボタンには `aria-label` を付ける。操作できる部品は `<button>`・`<input>` などの本来の要素で作る
- **Don't**：赤をエンド日の超過以外に使わない（削除ボタンと優先度 high は例外）。緑を「間に合う」以外に使わない
- **Don't**：絵文字を使わない。アイコンは線のアイコンにする
- **Don't**：詳細パネルを開いたときに背景を暗くしない
- **Don't**：グラデーションや装飾の影を足さない
- **Don't**：Excel出力でグラフ機能を使わない。バーはセルの塗りで表す

## Components Not In The Mockup

画面案にない部品（PJTタブ、休業日・有給のダイアログ、バックアップのメニュー、保存の失敗などの知らせ、削除・上書きの確認ダイアログ）は、この DESIGN.md のトークンと部品で作り、実装の段階で見た目をユーザーに確認する。

確認が済んだ部品：

- **確認ダイアログ**（段階6で確認、2026-11-24。`ui/ConfirmDialog.tsx`）：詳細パネルと同じ「浮いた面」にそろえる
  - 面は `surface`、枠は `border`、角丸 `panel`、影は詳細パネルと同じ。幅は `layout.panel-width`、内側の余白は `xl`（20px）。画面の真ん中に出す
  - 後ろは暗くしない（詳細パネルと同じ）
  - 1行目の問いは `body-md` の太字（700）。その下の説明は `body-sm`、`on-surface-sub`、行の高さ 1.7
  - ボタンは右に寄せ、「キャンセル」（`button-secondary`）、実行するボタン（削除なら `button-danger`）の順に `sm`（8px）空けて並べる。上の説明との間は `lg`（16px）。問いと説明の間は `sm`（8px）
