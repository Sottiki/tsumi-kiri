/**
 * 休業日・有給のダイアログ（tasks.md 8-2、SPEC 3.1「上部」・5章、決定事項1・15・17・81）
 *
 * 会社の休業日（年末年始など）や有給の一覧を、追加・削除する。一覧は全PJTで共通（SPEC 5章）。
 * 足した日は稼働日に数えないので、すぐに日程が組み直され、ガントには「休」と出る。
 *
 * ■ 足し方（決定事項81。決まりは daysOffModel.ts）
 * - 開始日だけを入れれば1日、終了日も入れれば期間でまとめて足す
 * - 足すのは平日（土日・祝日でない日）だけ。土日・祝日はもともと休みなので足さない
 * - 名前は空欄でもよい（一覧では「—」）
 * 足した後は、何日足したか（飛ばした日があればその日数も）をダイアログの中に出す。
 *
 * ■ 作り
 * 確認ダイアログ（ConfirmDialog.tsx）と同じく、HTML の <dialog> を showModal() で開く。
 * 外の部品を押せなくする・Esc で閉じる・閉じたら前のフォーカスへ戻す、をブラウザに任せる。
 * 開きたいときだけ描き、閉じたいときは描かない（呼ぶ側の state で出し入れする）。
 *
 * 足す・消すは、それぞれ元に戻す（Ctrl+Z）の1件になる（ストアの addDaysOff・removeDayOff）。
 * 見た目は画面案にないので、DESIGN.md のトークンで作る（Components Not In The Mockup：休業日・有給のダイアログ）。
 */

import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { useAppStore } from '../store';
import controls from './controls.module.css';
import { addedMessage, dayOffDateLabel, groupByYear, planDaysOff } from './daysOffModel';
import styles from './DaysOffDialog.module.css';
import { CloseIcon } from './icons';
import { MAX_INPUT_YEAR, MIN_INPUT_YEAR } from './parse';

/** 日付の欄のカレンダーで選べる範囲（ほかの日付の欄と同じ。決定事項60） */
const DATE_MIN = `${MIN_INPUT_YEAR}-01-01`;
const DATE_MAX = `${MAX_INPUT_YEAR}-12-31`;

export function DaysOffDialog({ onClose }: { onClose: () => void }) {
  const daysOff = useAppStore((state) => state.data.daysOff);
  const { addDaysOff, removeDayOff } = useAppStore((state) => state.actions);

  // 欄に入れている値。ストアには「追加」を押したときだけ入れるので、ここで持つ
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [label, setLabel] = useState('');
  /** 足した結果や、足せなかった理由。欄の下に出す */
  const [message, setMessage] = useState<string | null>(null);

  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  // 描いたら開く。消えるときは閉じる（閉じると、前にフォーカスがあった部品へ戻る）
  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) return;
    if (!dialog.open) dialog.showModal();
    return () => dialog.close();
  }, []);

  /** 「追加」を押したとき（Enter でも送られる） */
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    // フォームを送ると、ふつうはページを読み直してしまうので止める
    event.preventDefault();
    const plan = planDaysOff({ start, end, label });
    if (!plan.ok) {
      setMessage(plan.message);
      return;
    }
    addDaysOff(plan.days);
    setMessage(addedMessage(plan));
    // 続けて別の日を足せるよう、欄を空に戻す
    setStart('');
    setEnd('');
    setLabel('');
  };

  const years = groupByYear(daysOff);

  return (
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      aria-labelledby={titleId}
      onCancel={(event) => {
        // Esc キーで来る。ブラウザに閉じさせず、呼ぶ側に「描かない」と決めてもらう
        event.preventDefault();
        onClose();
      }}
      onKeyDown={(event) => {
        // Esc を、詳細パネルの「Esc で閉じる」（画面全体で受けている）まで届けない（ConfirmDialog と同じ）
        if (event.key === 'Escape') event.stopPropagation();
      }}
    >
      <div className={styles.head}>
        <h2 id={titleId} className={styles.title}>
          休業日・有給
        </h2>
        <button type="button" className={controls.iconClose} aria-label="閉じる" onClick={onClose}>
          <CloseIcon />
        </button>
      </div>
      <p className={styles.lead}>
        土日と日本の祝日は、自動で休みになります。会社の休業日や有給を足すと、その日は稼働日に数えません。全PJTで共通です。
      </p>

      <form className={styles.form} onSubmit={handleSubmit}>
        <label className={controls.field}>
          開始日
          <input
            className={controls.input}
            type="date"
            min={DATE_MIN}
            max={DATE_MAX}
            value={start}
            onChange={(event) => setStart(event.target.value)}
          />
        </label>
        <label className={controls.field}>
          終了日（期間で足すとき）
          <input
            className={controls.input}
            type="date"
            min={DATE_MIN}
            max={DATE_MAX}
            value={end}
            onChange={(event) => setEnd(event.target.value)}
          />
        </label>
        <label className={`${controls.field} ${styles.labelField}`}>
          名前
          <input
            className={controls.input}
            type="text"
            placeholder="例：年末休業、有給"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
          />
        </label>
        <button type="submit" className={`${controls.primary} ${styles.addButton}`}>
          追加
        </button>
      </form>
      {/* role="status"：足した結果を、読み上げでも伝える */}
      <p role="status" className={styles.message}>
        {message}
      </p>

      <div className={styles.list}>
        {years.length === 0 ? (
          <p className={styles.empty}>まだありません。</p>
        ) : (
          years.map(({ year, days }) => (
            <section key={year} aria-label={`${year}年`}>
              <h3 className={styles.year}>{year}年</h3>
              <ul className={styles.days}>
                {days.map((day) => (
                  <li key={day.date} className={styles.day}>
                    <span className={styles.date}>{dayOffDateLabel(day.date)}</span>
                    {/* 名前が空なら「—」（DESIGN.md の Voice：値がないとき） */}
                    <span className={styles.label}>{day.label === '' ? '—' : day.label}</span>
                    <button
                      type="button"
                      className={styles.remove}
                      aria-label={`${year}年${dayOffDateLabel(day.date)}を削除`}
                      onClick={() => removeDayOff(day.date)}
                    >
                      <CloseIcon />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </div>
    </dialog>
  );
}
