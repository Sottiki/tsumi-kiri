/**
 * 画面で使う、ただ1つのストア（architecture.md 6章）
 *
 * createAppStore（appStore.ts）は何度でもストアを作れる（テストではテストごとに作る）。
 * ここでは、画面のためのストアを1つだけ作り、React から読むための useAppStore を用意する。
 *
 * このファイルは読み込んだ時点で localStorage を読むので、テストからは読み込まない。
 * テストは appStore.ts の createAppStore を直接使う。
 */

import { useStore } from 'zustand';
import { createAppStore, type AppState } from './appStore';
import { createMemoryBackend, createPersistence, type KeyValueBackend } from './persistence';

/**
 * localStorage を取り出す。使えないとき（ブラウザの設定で保存が禁止されているときなど）は null。
 * localStorage は、読むだけで例外を投げることがあるので、try で囲む。
 */
function getLocalStorage(): KeyValueBackend | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

const localStorageBackend = getLocalStorage();
// localStorage が使えなければ、メモリの上に保存する（ページを閉じると消える）
const persistence = createPersistence(localStorageBackend ?? createMemoryBackend());

export const appStore = createAppStore({ persistence });

if (localStorageBackend === null) {
  appStore.setState({
    notice: {
      kind: 'save-error',
      message: 'このブラウザでは保存できません。ページを閉じると、入力したデータは消えます。',
    },
  });
}

// --- 閉じる直前の保存（SPEC 6章、決定事項45） ---
// まとめ書き（300ms）を待っている間にタブを閉じても失われないよう、待たずに書く。
// pagehide はページを離れるとき、visibilitychange（hidden）はタブを切り替えたり
// アプリを裏に回したりしたとき。スマホでは pagehide が来ないまま終わることがあるので、両方で書く
window.addEventListener('pagehide', () => persistence.flush());
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') persistence.flush();
});

/**
 * React のコンポーネントからストアを読む。
 * selector で必要な値だけを取り出すと、その値が変わったときだけ描き直される。
 *
 * 例：const project = useAppStore(selectActiveProject);
 *     const { updateTask } = useAppStore((s) => s.actions);
 */
export function useAppStore<T>(selector: (state: AppState) => T): T {
  return useStore(appStore, selector);
}
