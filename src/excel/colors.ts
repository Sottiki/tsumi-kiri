/**
 * Excel出力で使う色（DESIGN.md の Colors を書き写したもの）
 *
 * ■ なぜ書き写すのか
 * 画面は ui/tokens.css の CSS 変数で色を使うが、Excel のセルには CSS 変数が使えない。
 * そこで、Excel で使う色だけを DESIGN.md から TypeScript の定数に書き写す（architecture.md 8章・9章）。
 *
 * ■ 書き写しの間違いを防ぐ
 * キーは DESIGN.md のトークン名（colors.primary-soft → 'primary-soft'）と同じにする。
 * tests/excel-colors.test.ts が DESIGN.md を読み、ここの値がすべて DESIGN.md と同じかを確かめる。
 * DESIGN.md の色を変えたらテストが落ちるので、ここも合わせて直す。
 *
 * 値は DESIGN.md と同じ '#RRGGBB' の形で持ち、ExcelJS に渡すときに argb() で 'FFRRGGBB' に直す。
 */

export const EXCEL_COLORS = {
  // 文字
  'on-surface': '#1B1F27', // ふつうの文字
  'on-surface-sub': '#5B6270', // 2行目の条件、曜日の文字
  error: '#B42318', // エンド日を超えた行の文字、超過したバーの完了分
  sunday: '#C4320A', // 日曜・祝日・休業日の日付と曜日
  saturday: '#2448B8', // 土曜の日付と曜日

  // セルの背景
  'excel-header': '#E8ECF4', // 見出し（4・5行目のタスク表の部分）
  'excel-day-off': '#EEF0F3', // 土日祝の列
  'phase-row': '#EEF1F6', // 工程の行
  'excel-parent-row': '#F7F8FA', // 親タスクの行

  // 罫線
  'excel-grid': '#E1E3E6', // セルの区切り
  'end-line': '#D92D20', // エンド日の列の右の線

  // バー（画面と同じ色。DESIGN.md の Components の bar-*）
  primary: '#1D4ED8', // 末端の完了分
  'primary-soft': '#9DB8F5', // 末端の残り
  'parent-done': '#475569', // 親・工程の完了分
  'parent-rest': '#B4BCC9', // 親の残り
  'phase-rest': '#A9B4C4', // 工程の残り
  'error-soft': '#F4A39C', // 超過したバーの残り
} as const;

/** Excel出力で使う色のトークン名 */
export type ExcelColorToken = keyof typeof EXCEL_COLORS;

/**
 * トークン名から、ExcelJS が受け取る色の形（ARGB の16進数8桁）を作る。
 * 先頭の 'FF' は不透明度（A）。Excel のセルの色は不透明なので、いつも 'FF' にする。
 *
 * 例：argb('primary') → 'FF1D4ED8'
 */
export function argb(token: ExcelColorToken): string {
  const hex = EXCEL_COLORS[token];
  // '#1D4ED8' の '#' を取り除き、不透明の 'FF' を先頭に付ける
  return `FF${hex.slice(1).toUpperCase()}`;
}
