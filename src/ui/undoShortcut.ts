/**
 * 元に戻す・やり直すのキーの判定（tasks.md 5-5、SPEC 3.1、決定事項58）
 *
 * - Ctrl+Z（Mac は ⌘Z）：元に戻す
 * - Ctrl+Shift+Z（Mac は ⌘⇧Z）：やり直す
 *
 * キーの組み合わせを見るだけの関数にして、React にも DOM にも依存させない。
 * そのため Vitest でそのまま確かめられる（tests/ui/undoShortcut.test.ts）。
 * 実際にキーを受け取るのは useUndoShortcuts.ts。
 */

/** 判定に使う、キーボードのイベントの一部（KeyboardEvent の同じ名前の項目） */
export interface ShortcutKeys {
  /** 押したキーの文字。Shift を押していると大文字の 'Z' になる */
  key: string;
  ctrlKey: boolean;
  /** Mac の ⌘ キー */
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}

/**
 * 押したキーが、元に戻す・やり直すのどちらかなら、その種類を返す。どちらでもなければ null。
 *
 * - Ctrl と ⌘ のどちらか一方でよい（Windows は Ctrl、Mac は ⌘ をふだん使うため）
 * - Alt（Mac の option）を一緒に押しているときは、別の操作として扱わない
 */
export function undoShortcutOf(keys: ShortcutKeys): 'undo' | 'redo' | null {
  const withModifier = keys.ctrlKey || keys.metaKey;
  if (!withModifier || keys.altKey) return null;
  if (keys.key.toLowerCase() !== 'z') return null;
  return keys.shiftKey ? 'redo' : 'undo';
}
