/**
 * 元に戻す・やり直すを、画面全体で受け取る（tasks.md 5-5、SPEC 3.1、決定事項61）
 *
 * App で1回だけ使う。Ctrl+Z（⌘Z）でストアの undo、Ctrl+Shift+Z・Ctrl+Y（⌘⇧Z・⌘Y）で redo を呼ぶ。
 *
 * ■ 入力欄の中でも、アプリの履歴を使う（Excel やスプレッドシートと同じ）
 * ブラウザにも「入力欄の元に戻す」があるが、Chrome ではページ全体で1本の履歴を持つ。
 * 任せると、何も打っていない欄で Ctrl+Z を押したときに、前に別の欄で打った文字が戻り、
 * それが「新しい変更」としてストアに入ってしまう（アプリの履歴とブラウザの履歴がぶつかる）。
 * そこで、入力欄の中でもキーの既定の動きを止めて、アプリの履歴だけを使う。
 *
 * 入力欄の中で押したときの細かい動き（打ちかけの文字だけを捨てる、など）は、
 * 先に DraftInput.tsx が受け取って決める。DraftInput が自分で片付けたキーは、ここまで届かない。
 *
 * ■ キー以外から来る取り消し
 * 右クリックのメニューの「元に戻す」などは、キーではなく beforeinput（inputType が historyUndo）で来る。
 * これも止めて、アプリの履歴に回す。
 */

import { useEffect } from 'react';
import { useAppStore } from '../store';
import { undoShortcutOf } from './undoShortcut';

export function useUndoShortcuts(): void {
  const undo = useAppStore((state) => state.actions.undo);
  const redo = useAppStore((state) => state.actions.redo);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // 日本語入力の変換中のキーは、変換のためのものなので見ない
      if (event.isComposing) return;
      const shortcut = undoShortcutOf(event);
      if (shortcut === null) return;

      // ブラウザの「入力欄の元に戻す」が動かないよう止める
      event.preventDefault();
      if (shortcut === 'undo') undo();
      else redo();
    };

    const handleBeforeInput = (event: InputEvent) => {
      if (event.inputType === 'historyUndo') {
        event.preventDefault();
        undo();
      } else if (event.inputType === 'historyRedo') {
        event.preventDefault();
        redo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('beforeinput', handleBeforeInput);
    // 画面が消えるときは、受け取るのをやめる
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('beforeinput', handleBeforeInput);
    };
  }, [undo, redo]);
}
