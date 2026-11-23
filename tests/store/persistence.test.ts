/**
 * store/persistence.ts のテスト（tasks.md 3-2：localStorage への保存）
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createInitialAppData } from '../../src/core/sample';
import { updateTask } from '../../src/core/tree';
import type { AppData } from '../../src/core/types';
import {
  BROKEN_STORAGE_KEY,
  createMemoryBackend,
  createPersistence,
  SAVE_DELAY_MS,
  STORAGE_KEY,
} from '../../src/store/persistence';

/** id を順に振った、毎回同じ中身のデータ */
function sampleData(): AppData {
  let n = 0;
  return createInitialAppData('2026-11-19', () => `id${++n}`);
}

/** persist が呼ぶのと同じ形で、保存先にデータを渡す */
const valueOf = (data: AppData) => ({ state: { data }, version: 0 });

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('書き込み', () => {
  it(`最後の変更から ${SAVE_DELAY_MS}ms 待って、まとめて1回だけ書く`, () => {
    const backend = createMemoryBackend();
    const setItem = vi.spyOn(backend, 'setItem');
    const persistence = createPersistence(backend);

    const d1 = sampleData();
    const d2 = { ...d1, daysOff: [{ date: '2026-12-28', label: '有給' }] };
    persistence.setItem(STORAGE_KEY, valueOf(d1));
    vi.advanceTimersByTime(SAVE_DELAY_MS - 1);
    persistence.setItem(STORAGE_KEY, valueOf(d2));
    vi.advanceTimersByTime(SAVE_DELAY_MS - 1);
    expect(setItem).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(setItem).toHaveBeenCalledTimes(1);
    // 書かれるのは最後のデータ
    expect(JSON.parse(backend.entries.get(STORAGE_KEY)!).daysOff).toHaveLength(1);
  });

  it('保存する形（工数・進捗率は小数）で書く', () => {
    const backend = createMemoryBackend();
    const persistence = createPersistence(backend);
    persistence.setItem(STORAGE_KEY, valueOf(sampleData()));
    vi.advanceTimersByTime(SAVE_DELAY_MS);

    const saved = JSON.parse(backend.entries.get(STORAGE_KEY)!);
    const task = saved.projects[0].phases[0].tasks[1]; // 要件定義書作成（3.0人日・60%）
    expect(task.effort).toBe(3);
    expect(task.progress).toBe(0.6);
    expect(task).not.toHaveProperty('effortTenths');
  });

  it('flush で、待たずにすぐ書く（閉じる直前の保存）', () => {
    const backend = createMemoryBackend();
    const persistence = createPersistence(backend);
    persistence.setItem(STORAGE_KEY, valueOf(sampleData()));
    persistence.flush();
    expect(backend.entries.has(STORAGE_KEY)).toBe(true);
  });

  it('データが変わっていなければ書かない', () => {
    const backend = createMemoryBackend();
    const setItem = vi.spyOn(backend, 'setItem');
    const persistence = createPersistence(backend);
    const d = sampleData();
    persistence.setItem(STORAGE_KEY, valueOf(d));
    vi.advanceTimersByTime(SAVE_DELAY_MS);
    // 表示の状態だけが変わったときも persist は setItem を呼ぶが、データは同じ
    persistence.setItem(STORAGE_KEY, valueOf(d));
    vi.advanceTimersByTime(SAVE_DELAY_MS);
    expect(setItem).toHaveBeenCalledTimes(1);
  });

  it('書けなかったら知らせ、次の変更でもう一度書こうとする', () => {
    const backend = createMemoryBackend();
    const persistence = createPersistence(backend);
    const onError = vi.fn();
    persistence.onSaveError(onError);

    vi.spyOn(backend, 'setItem').mockImplementationOnce(() => {
      throw new Error('QuotaExceededError');
    });
    const d1 = sampleData();
    persistence.setItem(STORAGE_KEY, valueOf(d1));
    vi.advanceTimersByTime(SAVE_DELAY_MS);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(backend.entries.has(STORAGE_KEY)).toBe(false);

    const d2 = { ...d1, projects: [{ ...d1.projects[0]!, name: '変更' }] };
    persistence.setItem(STORAGE_KEY, valueOf(d2));
    vi.advanceTimersByTime(SAVE_DELAY_MS);
    expect(backend.entries.has(STORAGE_KEY)).toBe(true);
  });
});

describe('読み込み', () => {
  it('保存したデータを、メモリの形（整数）に戻して読む', () => {
    const backend = createMemoryBackend();
    const writer = createPersistence(backend);
    const d = sampleData();
    const project = d.projects[0]!;
    const firstTaskId = project.phases[0]!.tasks[0]!.id;
    // 0.1 刻みの工数（誤差の出やすい値）も、整数に戻ることを確かめる
    const edited = {
      ...d,
      projects: [updateTask(project, firstTaskId, { effortTenths: 3, progressPct: 33 })],
    };
    writer.setItem(STORAGE_KEY, valueOf(edited));
    writer.flush();

    const loaded = createPersistence(backend).getItem(STORAGE_KEY);
    expect(loaded?.state.data).toEqual(edited);
  });

  it('何も保存されていなければ null（初めて開いたとき）', () => {
    const persistence = createPersistence(createMemoryBackend());
    expect(persistence.getItem(STORAGE_KEY)).toBeNull();
    expect(persistence.takeLoadProblem()).toBeNull();
  });

  it('JSON として読めなければ、壊れたデータを別のキーに移して知らせる', () => {
    const backend = createMemoryBackend({ [STORAGE_KEY]: '{ 壊れた' });
    const persistence = createPersistence(backend);
    expect(persistence.getItem(STORAGE_KEY)).toBeNull();

    expect(backend.entries.get(BROKEN_STORAGE_KEY)).toBe('{ 壊れた');
    expect(backend.entries.has(STORAGE_KEY)).toBe(false);
    expect(persistence.takeLoadProblem()).toContain('JSON として読めません');
    // 知らせは一度取り出したら消える
    expect(persistence.takeLoadProblem()).toBeNull();
  });

  it('形が正しくなければ、fromSaved の理由を知らせる', () => {
    const raw = JSON.stringify({ version: 1, activeId: 'x', projects: [], daysOff: [] });
    const backend = createMemoryBackend({ [STORAGE_KEY]: raw });
    const persistence = createPersistence(backend);
    expect(persistence.getItem(STORAGE_KEY)).toBeNull();
    expect(backend.entries.get(BROKEN_STORAGE_KEY)).toBe(raw);
    expect(persistence.takeLoadProblem()).toContain('PJTが1つもありません');
  });
});
