/**
 * バックアップのメニュー（tasks.md 8-3、SPEC 3.1「上部」、決定事項18・82・83）
 *
 * ヘッダの「バックアップ」ボタンを押すと、メニュー（PopoverMenu）が開き、「書き出し」「読み込み」を選べる。
 * 対象は、全PJTと休業日・有給の一覧（アプリのデータ全体）。
 *
 * ■ 書き出し
 * 押した瞬間のデータを JSON にして、`工数ガント_バックアップ_<出力日>.json` でダウンロードする（ui/backup.ts）。
 *
 * ■ 読み込み（決定事項83）
 * 1. ファイルを選ぶ（画面に出さない <input type="file"> を、プログラムから押す）
 * 2. 中身を確かめる。壊れていれば、理由を知らせ（notice）に出して終わり。データは変えない
 * 3. 正しければ、ファイルの中身の件数を添えた確認ダイアログを出す
 * 4. 「上書き」を押したら、ストアの replaceData で全体を置き換える。元に戻す（Ctrl+Z）の1件になる
 * 読み込めたときの知らせは出さない（画面の中身が変わるので分かる）。
 */

import { useRef, useState, type ChangeEvent } from 'react';
import type { AppData } from '../core/types';
import { localToday } from '../store/appStore';
import { appStore, useAppStore } from '../store';
import {
  backupFileName,
  backupText,
  importConfirmMessages,
  importErrorMessage,
  parseBackupText,
} from './backup';
import { ConfirmDialog } from './ConfirmDialog';
import controls from './controls.module.css';
import { downloadBlob } from './download';
import { MenuItem, PopoverMenu } from './PopoverMenu';

export function BackupMenu() {
  const { replaceData, showNotice } = useAppStore((state) => state.actions);

  /** 読み込んで、上書きの確認を出しているデータ。出していなければ null */
  const [importing, setImporting] = useState<AppData | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /** 書き出し：押した瞬間のデータを、ストアから直接読んでファイルにする */
  const handleExport = () => {
    const { data } = appStore.getState();
    const blob = new Blob([backupText(data)], { type: 'application/json' });
    downloadBlob(blob, backupFileName(localToday()));
  };

  /** ファイルを選んだとき：中身を確かめ、正しければ確認を出す */
  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    // 同じファイルをもう一度選んだときも change が来るよう、選んだファイルを欄から外しておく
    input.value = '';
    if (file === undefined) return;

    let text: string;
    try {
      text = await file.text();
    } catch {
      showNotice({ kind: 'import-error', message: importErrorMessage('ファイルを開けません') });
      return;
    }
    const result = parseBackupText(text);
    if (!result.ok) {
      showNotice({ kind: 'import-error', message: importErrorMessage(result.reason) });
      return;
    }
    setImporting(result.data);
  };

  return (
    <>
      <PopoverMenu buttonClassName={controls.secondary} buttonContent="バックアップ" align="end">
        <MenuItem onSelect={handleExport}>書き出し</MenuItem>
        {/* 画面に出さないファイルの欄を、プログラムから押して、ファイルを選ぶ画面を開く */}
        <MenuItem onSelect={() => fileInputRef.current?.click()}>読み込み</MenuItem>
      </PopoverMenu>

      {/*
        ファイルを選ぶ欄。画面には出さず、「読み込み」を押したときにプログラムから押す。
        accept で、選ぶ画面に JSON のファイルだけを出す（ほかのファイルも選べるが、その場合は中身の確かめで弾く）
      */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".json,application/json"
        hidden
        aria-label="バックアップのファイルを選ぶ"
        onChange={(event) => void handleFile(event)}
      />

      {importing !== null && (
        <ConfirmDialog
          title="バックアップを読み込みますか？"
          messages={importConfirmMessages(importing)}
          confirmLabel="上書き"
          confirmVariant="primary"
          onConfirm={() => {
            replaceData(importing);
            setImporting(null);
          }}
          onCancel={() => setImporting(null)}
        />
      )}
    </>
  );
}
