/**
 * CSS のクラス名をつなぐ。false・null・undefined・'' は飛ばす。
 *
 * 例：cx(styles.cell, isToday && styles.today) → 今日なら 'cell today'、そうでなければ 'cell'
 *
 * 条件つきのクラスがいくつもある部品（ガントのマスなど）で、文字列の足し算を読みやすく書くために使う。
 */
export function cx(...names: (string | false | null | undefined)[]): string {
  return names.filter((name) => typeof name === 'string' && name !== '').join(' ');
}
