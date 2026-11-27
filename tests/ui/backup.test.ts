/**
 * バックアップの書き出しと読み込み（src/ui/backup.ts）のテスト（tasks.md 8-3、決定事項82・83）
 *
 * 書き出した文字を読み込むと、元のデータに戻ることと、
 * 壊れたファイルでは、画面に出せる理由が返ることを確かめる。
 * 形の検証そのもの（どの項目が壊れていたら何と言うか）は tests/storage.test.ts で確かめてある。
 */

import { describe, expect, it } from 'vitest';
import type { AppData } from '../../src/core/types';
import {
  backupFileName,
  backupText,
  importConfirmMessages,
  importErrorMessage,
  parseBackupText,
} from '../../src/ui/backup';
import { mockupProject, project, task } from '../helpers';

/** 2つのPJTと休業日を持つデータ */
function twoProjects(): AppData {
  const first = mockupProject();
  // project() の id はいつも 'p1' なので、2つ目は id を変える（PJTの id が重なると読み込めないため）
  const second = {
    ...project({ tasksByPhase: [[task('別PJTのタスク', { effort: 2.5, progress: 40 })]] }),
    id: 'p2',
  };
  return {
    version: 1,
    activeId: second.id,
    projects: [first, second],
    daysOff: [
      { date: '2026-12-29', label: '年末休業' },
      { date: '2026-12-30', label: '' },
    ],
  };
}

describe('backupFileName', () => {
  it('工数ガント_バックアップ_<出力日>.json の形にする（決定事項82）', () => {
    expect(backupFileName('2026-11-28')).toBe('工数ガント_バックアップ_2026-11-28.json');
  });
});

describe('書き出して読み込む', () => {
  it('書き出した文字を読み込むと、元のデータと同じになる（工数・進捗率・表示中のPJT・休業日も）', () => {
    const data = twoProjects();
    const result = parseBackupText(backupText(data));
    expect(result).toEqual({ ok: true, data });
  });

  it('書き出す文字は、保存する形（工数は人日の小数、進捗率は 0〜1）の JSON', () => {
    const saved = JSON.parse(backupText(twoProjects()));
    expect(saved.version).toBe(1);
    expect(saved.projects).toHaveLength(2);
    // 2つ目のPJTの1つ目のタスク：工数 2.5 人日、進捗 40%
    expect(saved.projects[1].phases[0].tasks[0]).toMatchObject({ effort: 2.5, progress: 0.4 });
  });
});

describe('parseBackupText：壊れたファイル', () => {
  it('JSON として読めなければ、その理由を返す', () => {
    expect(parseBackupText('これは JSON ではない')).toEqual({
      ok: false,
      reason: 'JSON のファイルとして読めません',
    });
  });

  it('JSON でも、形が正しくなければ fromSaved の理由を返す', () => {
    const result = parseBackupText(JSON.stringify({ version: 1, projects: [] }));
    expect(result).toEqual({ ok: false, reason: 'PJTが1つもありません' });
  });

  it('新しいバージョンのアプリで書き出したファイルは読み込まない', () => {
    const saved = JSON.parse(backupText(twoProjects()));
    saved.version = 99;
    const result = parseBackupText(JSON.stringify(saved));
    expect(result.ok).toBe(false);
  });
});

describe('画面に出す文', () => {
  it('読み込めなかったときは、理由と「データは変えていない」ことを伝える', () => {
    expect(importErrorMessage('PJTが1つもありません')).toBe(
      'バックアップを読み込めませんでした（PJTが1つもありません）。データは変えていません。',
    );
  });

  it('上書きの確認には、ファイルの中身の件数と、元に戻せることを出す（決定事項83）', () => {
    expect(importConfirmMessages(twoProjects())).toEqual([
      '今の全PJTと休業日・有給が、ファイルの内容（PJT 2件、休業日・有給 2件）に置き換わります。',
      '元に戻す（Ctrl+Z）で、読み込む前に戻せます。',
    ]);
  });
});
