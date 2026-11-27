/**
 * 知らせ（tasks.md 8-4、SPEC 6章・3.3、決定事項44・55・83・84）
 *
 * ストアの知らせ（notice）を、画面の左下に浮かせて出す。知らせは次の4つ：
 * - 保存に失敗した（容量が足りない、保存が禁止されているなど）
 * - 保存データを読み込めなかった（壊れていた。サンプルPJTで始めたことを伝える）
 * - Excel のファイルを作れなかった
 * - バックアップのファイルを読み込めなかった
 *
 * 閉じるボタンで閉じるまで残す。新しい知らせが来たら、前の知らせと置き換える（ストアは1つだけ持つ）。
 * 右に出る詳細パネルと重ならないよう、左に置く（決定事項84）。
 *
 * role="alert"：出たときに、読み上げで内容をすぐ伝える。
 * 赤は DESIGN.md でエンド日の超過のために取ってあるので使わず、注意のアイコンを warning の色にする。
 */

import { useAppStore } from '../store';
import controls from './controls.module.css';
import { CloseIcon, WarningIcon } from './icons';
import styles from './NoticeToast.module.css';

export function NoticeToast() {
  const notice = useAppStore((state) => state.notice);
  const dismissNotice = useAppStore((state) => state.actions.dismissNotice);
  if (notice === null) return null;

  return (
    <div className={styles.toast} role="alert" data-testid="notice" data-kind={notice.kind}>
      <WarningIcon className={styles.icon} />
      <p className={styles.message}>{notice.message}</p>
      <button
        type="button"
        className={controls.iconClose}
        aria-label="知らせを閉じる"
        onClick={dismissNotice}
      >
        <CloseIcon />
      </button>
    </div>
  );
}
