/**
 * 確認ダイアログ（tasks.md 6-10、SPEC 3.2、決定事項70）
 *
 * 取り返しのつきにくい操作の前に、本当に行うかを聞く。
 * 段階6ではタスクの削除に使い、段階8のPJTの削除・バックアップの上書きでも使い回す。
 * 実行するボタンは、削除なら赤（button-danger）、バックアップの上書きなら主ボタン（button-primary）にする
 * （DESIGN.md：赤は削除にだけ使う。決定事項83）。
 *
 * ■ 作り
 * HTML の <dialog> 要素を showModal() で開く。こうすると、ブラウザが次のことをしてくれる：
 * - ダイアログの外の部品を押せなくする（キーボードのフォーカスもダイアログの中だけを回る）
 * - Esc キーで cancel イベントを出す（ここではキャンセルとして扱う）
 * - 閉じたら、開く前にフォーカスがあった部品へ戻す
 *
 * ブラウザの window.confirm を使わないのは、見た目をアプリにそろえるため（決定事項70）。
 *
 * ■ 使い方
 * 開きたいときだけ描き、閉じたいときは描かない（呼ぶ側の state で出し入れする）。
 *   {deleting && <ConfirmDialog title=… onConfirm=… onCancel={() => setDeleting(false)} />}
 *
 * 見た目は画面案にないので、DESIGN.md のトークンと部品だけで作る（Components Not In The Mockup）。
 */

import { useEffect, useId, useRef } from 'react';
import controls from './controls.module.css';
import styles from './ConfirmDialog.module.css';

interface ConfirmDialogProps {
  /** 1行目の問い（例：「「本番リリース」を削除しますか？」） */
  title: string;
  /** 問いの下に出す説明。1つが1段落 */
  messages: readonly string[];
  /** 実行するボタンの文字（例：「削除」） */
  confirmLabel: string;
  /** 実行するボタンの見た目。danger は赤（削除）、primary は青の主ボタン（上書き）。省略すると danger */
  confirmVariant?: 'danger' | 'primary';
  onConfirm: () => void;
  /** キャンセル・Esc キーのとき */
  onCancel: () => void;
}

export function ConfirmDialog({
  title,
  messages,
  confirmLabel,
  confirmVariant = 'danger',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  // 問いの文を、ダイアログの名前として読み上げに伝えるための id（aria-labelledby）
  const titleId = useId();

  // 描いたら開く。消えるときは閉じる（閉じると、前にフォーカスがあった部品へ戻る）
  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) return;
    if (!dialog.open) dialog.showModal();
    return () => dialog.close();
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      aria-labelledby={titleId}
      onCancel={(event) => {
        // Esc キーで来る。ブラウザに閉じさせず、呼ぶ側に「描かない」と決めてもらう
        event.preventDefault();
        onCancel();
      }}
      onKeyDown={(event) => {
        // Esc を、詳細パネルの「Esc で閉じる」（画面全体で受けている）まで届けない。
        // 届くと、ダイアログと一緒にパネルまで閉じてしまうため
        if (event.key === 'Escape') event.stopPropagation();
      }}
    >
      <h2 id={titleId} className={styles.title}>
        {title}
      </h2>
      {messages.map((message) => (
        <p key={message} className={styles.message}>
          {message}
        </p>
      ))}
      <div className={styles.buttons}>
        {/* 取り消せる方（キャンセル）に、はじめのフォーカスを置く。Enter をうっかり押しても実行しないように */}
        <button type="button" className={controls.secondary} autoFocus onClick={onCancel}>
          キャンセル
        </button>
        <button
          type="button"
          className={confirmVariant === 'danger' ? controls.danger : controls.primary}
          onClick={onConfirm}
        >
          {confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
