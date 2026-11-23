/**
 * 打っている途中の文字を手元に持つ入力欄（tasks.md 5-1・5-2・5-5、SPEC 3.1「操作」）
 *
 * 一覧の工数・進捗率と、ヘッダのPJT名・開始日・エンド日で使う。
 *
 * ■ なぜ手元に持つのか
 * 入力欄の value にストアの値をそのまま入れると、ストアに反映しない文字（打っている途中の「3.」など）を
 * 打った瞬間に、React が元の値で欄を書き戻してしまい、続きが打てない。
 * そこで、打っている間は「打った文字（draft）」を表示し、
 * 正しい値になったときだけ、呼ぶ側（onDraft）がストアに反映する。
 *
 * ■ 動き
 * - 打つたび：onDraft(打った文字, 編集の回の目印) を呼ぶ。反映するかどうかは呼ぶ側が決める
 * - 欄を離れたとき：draft を捨てて、ストアの今の値（value）の表示に戻す。
 *   反映しなかった文字（「1.25」など）はここで消え、工数なら「3.0」のように整った形になる（決定事項56）
 * - Enter：欄を離れたときと同じにする（カーソルを外す）
 *
 * ■ 編集の回の目印（editSession）
 * カーソルが入るたびに新しい目印を作り、onDraft に渡す。ストアは同じ目印の変更を、
 * 元に戻すの履歴で1件にまとめる。欄に入ってから離れるまでが1件になる（決定事項61）。
 *
 * ■ 外から値が変わったとき（元に戻すなど）
 * 打っている途中に Ctrl+Z を押すと、ストアの値が戻る。そのときは打ちかけの文字を捨てて、新しい値を出す。
 * 「外から変わった」は、draft に「この文字を打ったあとの欄の値（base）」を覚えておき、
 * value がそれと違っていたら、と判定する。
 *
 * ■ 打ちかけの文字だけがあるときの Ctrl+Z
 * この回でまだ何も反映していない（「1.25」のように正しくない文字だけを打った）ときは、
 * スプレッドシートでセルの入力を取り消すのと同じく、打ちかけの文字だけを捨てる。
 * アプリの履歴は戻さない（ひとつ前の、別の変更が戻ってしまうため）。
 */

import { useRef, useState, type InputHTMLAttributes, type KeyboardEvent } from 'react';
import { undoShortcutOf } from './undoShortcut';

interface DraftInputProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'value' | 'defaultValue' | 'onChange'
> {
  /** ストアの今の値を、欄に出す形にしたもの（工数なら '3.0'） */
  value: string;
  /**
   * 打つたびに呼ばれる。正しい値ならストアに反映する。
   * 反映したら、ストアの新しい値を欄に出す形にして返す（工数を「3.50」と打って 35 を入れたら '3.5'）。
   * 反映しなかったら（正しくない値、今と同じ値）null を返す。
   * @param editSession 編集の回の目印。ストアの updateTask・updateProject にそのまま渡す
   */
  onDraft: (text: string, editSession: string) => string | null;
}

/** 打っている途中の状態 */
interface Draft {
  /** 欄に打った文字 */
  text: string;
  /** この文字を打ったあと、ストアの値（を欄に出す形にしたもの）がこうなっているはず、という値 */
  base: string;
  /** この編集の回で、ストアに1回でも反映したか */
  committed: boolean;
}

/** 編集の回の目印に振る番号。画面全体で1つずつ増やす */
let editSessionCounter = 0;

export function DraftInput({
  value,
  onDraft,
  onFocus,
  onBlur,
  onKeyDown,
  ...rest
}: DraftInputProps) {
  const [draft, setDraft] = useState<Draft | null>(null);
  /** 今の編集の回の目印。カーソルが入るたびに作り直す（描き直しに関わらないので ref に持つ） */
  const editSessionRef = useRef('');

  // 外から値が変わった（元に戻すなど）なら、打ちかけの文字を捨てる。
  // 描いている途中で state を直すのは、React の「前の描画の値から state を合わせる」書き方
  // （https://react.dev/learn/you-might-not-need-an-effect）。useEffect で直すより、ちらつかない
  if (draft !== null && draft.base !== value) {
    setDraft(null);
  }
  const shown = draft !== null && draft.base === value ? draft.text : value;

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    onKeyDown?.(event);

    // 日本語入力の変換を確定する Enter では、カーソルを外さない
    if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
      event.currentTarget.blur();
      return;
    }

    // まだ何も反映していない打ちかけの文字があるときの Ctrl+Z：その文字だけを捨てる
    const hasUncommittedText = draft !== null && !draft.committed && draft.text !== value;
    if (undoShortcutOf(event) === 'undo' && hasUncommittedText) {
      event.preventDefault(); // ブラウザの「入力欄の元に戻す」を止める
      event.stopPropagation(); // 画面全体の Ctrl+Z（useUndoShortcuts）まで届けない
      setDraft(null);
    }
    // それ以外の Ctrl+Z・やり直すは、そのまま画面全体の useUndoShortcuts が受け取る
  };

  return (
    <input
      {...rest}
      value={shown}
      onFocus={(event) => {
        // 新しい編集の回を始める
        editSessionCounter += 1;
        editSessionRef.current = `input-${editSessionCounter}`;
        onFocus?.(event);
      }}
      onChange={(event) => {
        const text = event.target.value;
        const newValue = onDraft(text, editSessionRef.current);
        setDraft({
          text,
          // 反映したら、ストアの値は newValue になる。反映しなければ、今の値のまま
          base: newValue ?? value,
          committed: (draft?.committed ?? false) || newValue !== null,
        });
      }}
      onBlur={(event) => {
        setDraft(null);
        onBlur?.(event);
      }}
      onKeyDown={handleKeyDown}
    />
  );
}
