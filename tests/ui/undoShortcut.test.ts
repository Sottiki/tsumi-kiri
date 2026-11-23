/**
 * ui/undoShortcut.ts のテスト（tasks.md 5-5：元に戻す・やり直すのキー。SPEC 3.1、決定事項58・61）
 */
import { describe, expect, it } from 'vitest';
import { undoShortcutOf, type ShortcutKeys } from '../../src/ui/undoShortcut';

/** 何も押していない状態から、押したものだけを指定して作る */
const keys = (patch: Partial<ShortcutKeys>): ShortcutKeys => ({
  key: 'z',
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  altKey: false,
  ...patch,
});

describe('元に戻す・やり直すのキー', () => {
  it('Ctrl+Z と ⌘Z は元に戻す', () => {
    expect(undoShortcutOf(keys({ ctrlKey: true }))).toBe('undo');
    expect(undoShortcutOf(keys({ metaKey: true }))).toBe('undo');
  });

  it('Ctrl+Shift+Z と ⌘⇧Z はやり直す（Shift を押すと key は大文字の Z になる）', () => {
    expect(undoShortcutOf(keys({ key: 'Z', ctrlKey: true, shiftKey: true }))).toBe('redo');
    expect(undoShortcutOf(keys({ key: 'Z', metaKey: true, shiftKey: true }))).toBe('redo');
  });

  it('Ctrl+Y と ⌘Y もやり直す（Excel と同じ）', () => {
    expect(undoShortcutOf(keys({ key: 'y', ctrlKey: true }))).toBe('redo');
    expect(undoShortcutOf(keys({ key: 'y', metaKey: true }))).toBe('redo');
  });

  it('Ctrl・⌘ なしの Z、Alt つき、Ctrl+Shift+Y、ほかのキーは、どちらでもない', () => {
    expect(undoShortcutOf(keys({}))).toBeNull();
    expect(undoShortcutOf(keys({ key: 'Z', shiftKey: true }))).toBeNull();
    expect(undoShortcutOf(keys({ ctrlKey: true, altKey: true }))).toBeNull();
    expect(undoShortcutOf(keys({ key: 'Y', ctrlKey: true, shiftKey: true }))).toBeNull();
    expect(undoShortcutOf(keys({ key: 'x', ctrlKey: true }))).toBeNull();
  });
});
