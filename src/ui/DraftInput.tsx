/**
 * 打っている途中の文字を手元に持つ入力欄（tasks.md 5-1・5-2、SPEC 3.1「操作」）
 *
 * 一覧の工数・進捗率と、ヘッダのPJT名・開始日・エンド日で使う。
 *
 * ■ なぜ手元に持つのか
 * 入力欄の value にストアの値をそのまま入れると、ストアに反映しない文字（打っている途中の「3.」など）を
 * 打った瞬間に、React が元の値で欄を書き戻してしまい、続きが打てない。
 * そこで、欄にカーソルがある間は「打った文字（draft）」を表示し、
 * 正しい値になったときだけ、呼ぶ側（onDraft）がストアに反映する。
 *
 * ■ 動き
 * - 打つたび：draft を更新し、onDraft(打った文字) を呼ぶ。反映するかどうかは呼ぶ側が決める
 * - 欄を離れたとき：draft を捨てて、ストアの今の値（value）の表示に戻す。
 *   反映しなかった文字（「1.25」など）はここで消え、工数なら「3.0」のように整った形になる（決定事項56）
 * - Enter：欄を離れたときと同じにする（カーソルを外す）
 *
 * 欄にカーソルがない間は、value をそのまま出す。元に戻す（Ctrl+Z）でストアの値が変わったときも、
 * そのまま新しい値が出る。
 */

import { useState, type InputHTMLAttributes, type KeyboardEvent } from 'react';

interface DraftInputProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'value' | 'defaultValue' | 'onChange'
> {
  /** ストアの今の値を、欄に出す形にしたもの（工数なら '3.0'） */
  value: string;
  /** 打つたびに呼ばれる。正しい値ならストアに反映する */
  onDraft: (text: string) => void;
}

export function DraftInput({
  value,
  onDraft,
  onFocus,
  onBlur,
  onKeyDown,
  ...rest
}: DraftInputProps) {
  /** 打っている途中の文字。カーソルがないときは null（value を出す） */
  const [draft, setDraft] = useState<string | null>(null);

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    onKeyDown?.(event);
    // 日本語入力の変換を確定する Enter では、カーソルを外さない
    if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
      event.currentTarget.blur();
    }
  };

  return (
    <input
      {...rest}
      value={draft ?? value}
      onFocus={(event) => {
        // カーソルが入った時点の表示から、打ち始める
        setDraft(value);
        onFocus?.(event);
      }}
      onChange={(event) => {
        setDraft(event.target.value);
        onDraft(event.target.value);
      }}
      onBlur={(event) => {
        setDraft(null);
        onBlur?.(event);
      }}
      onKeyDown={handleKeyDown}
    />
  );
}
