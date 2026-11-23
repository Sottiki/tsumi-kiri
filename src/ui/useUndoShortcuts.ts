/**
 * 元に戻す・やり直すのキーを、画面全体で受け取る（tasks.md 5-5、SPEC 3.1）
 *
 * App で1回だけ使う。window の keydown を見て、Ctrl+Z（⌘Z）でストアの undo、
 * Ctrl+Shift+Z（⌘⇧Z）で redo を呼ぶ。
 *
 * 入力欄にカーソルがあるときは、何もしない（ブラウザに任せる。architecture.md 6章）。
 * 入力欄の中の Ctrl+Z は「打った文字を戻す」というブラウザ標準の動きなので、それを邪魔しない。
 * ブラウザが入力欄の文字を戻すと、入力欄の変更としてストアにも反映される。
 */

import { useEffect } from 'react';
import { useAppStore } from '../store';
import { undoShortcutOf } from './undoShortcut';

/**
 * キーを押したとき、カーソルが入力欄（文字を打てる場所）にあるか。
 * input・textarea・select と、文字を直接書ける要素（contenteditable）を入力欄とみなす。
 */
function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  );
}

export function useUndoShortcuts(): void {
  const undo = useAppStore((state) => state.actions.undo);
  const redo = useAppStore((state) => state.actions.redo);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // 日本語入力の変換中のキーは、変換のためのものなので見ない
      if (event.isComposing) return;
      const shortcut = undoShortcutOf(event);
      if (shortcut === null || isEditableTarget(event.target)) return;

      // ブラウザ自身の「元に戻す」（ページ全体の編集の取り消し）が動かないよう止める
      event.preventDefault();
      if (shortcut === 'undo') undo();
      else redo();
    };
    window.addEventListener('keydown', handleKeyDown);
    // 画面が消えるときは、受け取るのをやめる
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo]);
}
