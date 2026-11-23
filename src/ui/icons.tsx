/**
 * アイコン（DESIGN.md の Shapes：線のアイコン、線の太さ 2〜2.5px。炎だけは塗り）
 *
 * 形は画面案①の SVG と同じ。色は CSS の変数（tokens.css）で付けるので、
 * ここでは stroke・fill に currentColor か、呼び出し側から渡す className を使う。
 *
 * 意味のあるアイコン（炎・メモ）は role="img" と aria-label を付けて、読み上げでも分かるようにする。
 * 飾りのアイコン（開閉マークなど、ボタンの側に名前があるもの）は aria-hidden にする。
 */

interface IconProps {
  className?: string;
}

/** 開閉マーク（下向きの山形）。たたんだときは CSS で右向きに回す */
export function ChevronIcon({ className }: IconProps) {
  return (
    <svg
      className={className}
      width="12"
      height="12"
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

/**
 * 炎（期日超過）。DESIGN.md でこれだけは塗りのアイコン。
 * @param decorative 横に「期日超過」の文字があるとき（凡例）は true にして、読み上げが2回にならないようにする
 */
export function FireIcon({
  className,
  size = 14,
  decorative = false,
}: IconProps & { size?: number; decorative?: boolean }) {
  // 飾りなら読み上げから外し、意味のあるアイコンなら名前を付ける
  const a11y = decorative
    ? { 'aria-hidden': true as const }
    : { role: 'img' as const, 'aria-label': '期日超過' };
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" {...a11y}>
      <path
        d="M12 2c.8 3.6-2.6 5.6-2.6 9.2 0 1.6 1.2 2.8 2.6 2.8s2.6-1.2 2.6-2.8c0-.9-.3-1.7-.8-2.5 2.6 1.6 4.2 4.3 4.2 7.1A6 6 0 0 1 12 22a6 6 0 0 1-6-6.2C6 9.6 12 7.6 12 2z"
        fill="currentColor"
      />
    </svg>
  );
}

/** メモあり（吹き出し） */
export function MemoIcon({ className }: IconProps) {
  return (
    <svg
      className={className}
      width="13"
      height="13"
      viewBox="0 0 24 24"
      role="img"
      aria-label="メモあり"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 4h16v12H8l-4 4z" />
      <path d="M8 9h8" />
      <path d="M8 12h5" />
    </svg>
  );
}
