/**
 * localStorage への保存（tasks.md 3-2、architecture.md 7章、SPEC 6章）
 *
 * Zustand の persist（保存の仕組み）に渡す「保存先」を、自前で作る。
 * persist のふつうの保存先（createJSONStorage）を使わないのは、次のことをするため。
 *
 * 1. 保存する形への変換：メモリの形（工数・進捗率が整数）を、toSaved で保存する形（小数）にしてから書く。
 *    読むときは fromSaved で検証しながら戻す（architecture.md 4章）。
 *    persist のふつうの保存先だと、メモリの形が { state: …, version: 0 } に包まれたまま書かれてしまう。
 * 2. まとめ書き：変更のたびに書くと、工数を打つ1文字ごとに書き込むことになる。
 *    最後の変更から 300ms 待って、まとめて1回だけ書く。
 * 3. 閉じる直前の保存：待っている間にタブを閉じても失われないよう、flush で待たずに書けるようにする。
 * 4. 失敗の知らせ：容量不足などで書けなかったとき、壊れたデータを読んだときに、ストアへ知らせる。
 *
 * 書き込む先（localStorage）は差し替えられる。テストでは、メモリの上の仮の保存先を使う。
 */

import type { PersistStorage, StorageValue } from 'zustand/middleware';
import { fromSaved, toSaved } from '../core/storage';
import type { AppData } from '../core/types';

/** 保存のキー（architecture.md 7章） */
export const STORAGE_KEY = 'tsumikiri:data';

/** 読み込めなかったデータを残しておくキー（SPEC 6章、決定事項44）。残すのは最新の1件だけ */
export const BROKEN_STORAGE_KEY = 'tsumikiri:data:broken';

/** まとめ書きで待つ時間（ミリ秒。tasks.md 3-2） */
export const SAVE_DELAY_MS = 300;

/**
 * 書き込む先。ブラウザの localStorage と同じ形（getItem / setItem / removeItem）。
 * localStorage をそのまま渡せるし、テストでは Map を使った仮のものを渡せる。
 */
export interface KeyValueBackend {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** persist が保存するもの。ストアの状態のうち、保存するデータ（AppData）だけ */
export interface PersistedState {
  data: AppData;
}

/** 保存先。persist に渡す部分（PersistStorage）に、まとめ書きと知らせの機能を足したもの */
export interface AppPersistence extends PersistStorage<PersistedState> {
  /**
   * 保存データを読む。PersistStorage では Promise も返せるが、localStorage は同期で読めるので、
   * 必ずその場で結果を返す。こうすると、ストアを作り終えた時点で読み込みも終わっている
   */
  getItem(name: string): StorageValue<PersistedState> | null;
  /** 待っている書き込みがあれば、待たずにすぐ書く（閉じる直前に呼ぶ） */
  flush(): void;
  /**
   * 読み込みのときに起きた問題を取り出す（一度取り出したら消える）。
   * 読み込みはストアを作る途中で行われ、まだストアに知らせられないので、ここに取っておく。
   */
  takeLoadProblem(): string | null;
  /** 書き込みに失敗したときに呼ぶ関数を決める。ストアを作った後に設定する */
  onSaveError(handler: (message: string) => void): void;
}

/**
 * 保存先を作る。
 * @param backend 書き込む先（ふつうは window.localStorage）
 */
export function createPersistence(backend: KeyValueBackend): AppPersistence {
  /** 書くのを待っているデータ。なければ null */
  let pending: AppData | null = null;
  /** まとめ書きのタイマー */
  let timer: ReturnType<typeof setTimeout> | null = null;
  /** 最後に書いた（または読み込んだ）データ。同じものを何度も書かないために覚えておく */
  let lastWritten: AppData | null = null;
  let loadProblem: string | null = null;
  let saveErrorHandler: (message: string) => void = () => {};

  /** 待っているデータを、今すぐ書く */
  const writeNow = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    if (pending === null) return;
    const data = pending;
    pending = null;
    try {
      backend.setItem(STORAGE_KEY, JSON.stringify(toSaved(data)));
      lastWritten = data;
    } catch {
      // 容量不足（QuotaExceededError）や、保存が禁止されている場合など。
      // データは画面（ストア）に残っているので、知らせるだけにする（architecture.md 7章）。
      // lastWritten は更新しないので、次の変更のときにもう一度書こうとする
      saveErrorHandler('データを保存できませんでした。バックアップを書き出しておいてください。');
    }
  };

  return {
    getItem(name): StorageValue<PersistedState> | null {
      let raw: string | null;
      try {
        raw = backend.getItem(name);
      } catch {
        loadProblem = '保存先（localStorage）を読めませんでした。サンプルのPJTで始めます。';
        return null;
      }
      // 初めて開いたとき。persist は何も読み込まず、ストアの初期値（サンプルPJT）のまま始まる
      if (raw === null) return null;

      // JSON として読めないときも、fromSaved が理由を返したときも、同じ「壊れている」扱いにする
      let reason: string;
      try {
        const result = fromSaved(JSON.parse(raw));
        if (result.ok) {
          lastWritten = result.data;
          // version は persist 自身の版の番号。保存する形の版は SavedAppData.version で管理するので、
          // persist の版は使わない（persist の既定の 0 と同じにして、persist の移行を動かさない）
          return { state: { data: result.data }, version: 0 };
        }
        reason = result.reason;
      } catch {
        reason = 'JSON として読めません';
      }

      // 壊れたデータは消さずに、別のキーへ移す（決定事項44）。
      // 元のキーは消しておく。次に開いたとき、また同じ壊れたデータを読んで知らせが出続けないように
      try {
        backend.setItem(BROKEN_STORAGE_KEY, raw);
        backend.removeItem(name);
      } catch {
        // 移せなくても、読み込まないことには変わりないので続ける
      }
      loadProblem = `保存されていたデータを読み込めませんでした（${reason}）。サンプルのPJTで始めます。壊れたデータは「${BROKEN_STORAGE_KEY}」に残してあります。`;
      return null;
    },

    setItem(_name, value) {
      const data = value.state.data;
      // persist は、表示の状態（開いているタスクなど）が変わったときにも setItem を呼ぶ。
      // 保存するデータが変わっていなければ、書く必要はない（不変更新なので === で比べられる）
      if (data === (pending ?? lastWritten)) return;
      pending = data;
      // 前のタイマーを止めて、最後の変更から 300ms 待つ
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(writeNow, SAVE_DELAY_MS);
    },

    removeItem(name) {
      pending = null;
      if (timer !== null) clearTimeout(timer);
      timer = null;
      backend.removeItem(name);
    },

    flush: writeNow,

    takeLoadProblem() {
      const problem = loadProblem;
      loadProblem = null;
      return problem;
    },

    onSaveError(handler) {
      saveErrorHandler = handler;
    },
  };
}

/**
 * メモリの上の仮の書き込み先。テストと、localStorage が使えないときの代わりに使う。
 * 中身は Map に入れるだけなので、ページを閉じると消える。
 */
export function createMemoryBackend(initial: Record<string, string> = {}): KeyValueBackend & {
  entries: Map<string, string>;
} {
  const entries = new Map(Object.entries(initial));
  return {
    entries,
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => {
      entries.set(key, value);
    },
    removeItem: (key) => {
      entries.delete(key);
    },
  };
}
