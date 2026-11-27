/**
 * ボタンの下に開く小さなメニュー（tasks.md 8-1・8-3。PJTタブのメニュー、バックアップのメニュー）
 *
 * ■ 作り：HTML の popover
 * メニューの箱に popover="auto"、開くボタンに popoverTarget（箱の id）を付ける。こうすると、ブラウザが次のことをしてくれる：
 * - ボタンを押すと開き、もう一度押すと閉じる
 * - メニューの外を押す・Esc キーを押すと閉じる（ほかのメニューを開くと、前のメニューは閉じる）
 * - メニューを画面のいちばん上の層（top layer）に出す。PJTタブの帯のように、はみ出しを隠す箱の中からでも切れずに出る
 * キー操作を自分で足さず、ブラウザの基本の動きに任せる（決定事項74 と同じ考え方）。
 * メニューの中は、ふつうのボタン（MenuItem）を並べるだけにする。ARIA の menu（矢印キーで選ぶ部品）にはしない。
 *
 * ■ 項目を押したら閉じる
 * 項目のボタンにも popoverTarget（同じ箱の id）と popoverTargetAction="hide" を付ける。
 * 押すと、onSelect を呼んだ後に、ブラウザがメニューを閉じる。閉じるための JavaScript は書かなくてよい。
 * 箱の id は、React の context で項目に渡す（項目を並べる側が id を知らなくてよいように）。
 *
 * ■ 位置
 * top layer に出た箱は、ふだんは画面の真ん中に置かれる。開く直前（beforetoggle）にボタンの位置を測り、
 * ボタンのすぐ下に置き直す。メニューの左端をボタンの左端に（align="start"）、
 * または右端をボタンの右端に（align="end"。画面の右端にあるバックアップのボタン）そろえる。
 * 開いている間に画面をスクロールすることはない（画面全体は動かさない作り。architecture.md 8章）ので、開くときだけ測ればよい。
 */

import { createContext, useContext, useId, useRef, type ReactNode, type ToggleEvent } from 'react';
import styles from './PopoverMenu.module.css';

/** 開いているメニューの箱の id。MenuItem が、押したときに閉じる先として使う */
const MenuIdContext = createContext<string | undefined>(undefined);

interface PopoverMenuProps {
  /** メニューを開くボタンの中身（文字やアイコン） */
  buttonContent: ReactNode;
  buttonClassName: string | undefined;
  /** ボタンの名前（読み上げ用）。中身がアイコンだけのときに付ける */
  buttonLabel?: string;
  /** メニューの端を、ボタンのどちらの端にそろえるか */
  align: 'start' | 'end';
  /** メニューの中身（MenuItem・MenuNote を並べる） */
  children: ReactNode;
}

export function PopoverMenu({
  buttonContent,
  buttonClassName,
  buttonLabel,
  align,
  children,
}: PopoverMenuProps) {
  // popoverTarget で箱を指すための id。useId は画面の中で重ならない id を作る
  const menuId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  /** 開く直前に、ボタンのすぐ下へ置き直す */
  const handleBeforeToggle = (event: ToggleEvent<HTMLDivElement>) => {
    const button = buttonRef.current;
    const menu = menuRef.current;
    if (event.newState !== 'open' || button === null || menu === null) return;
    const rect = button.getBoundingClientRect();
    // ボタンとメニューの間は 4px（spacing-2xs）。CSS の変数を読んで、値を2か所に書かないようにする
    const gap = parseFloat(getComputedStyle(menu).getPropertyValue('--spacing-2xs')) || 0;
    menu.style.top = `${rect.bottom + gap}px`;
    if (align === 'start') {
      menu.style.left = `${rect.left}px`;
      menu.style.right = 'auto';
    } else {
      // 右端をそろえるときは、画面の右端からの距離で置く（メニューの幅を測らなくてよい）
      menu.style.right = `${document.documentElement.clientWidth - rect.right}px`;
      menu.style.left = 'auto';
    }
  };

  return (
    <>
      {/*
        data-no-drag：PJTタブの中で、このボタンを押してもタブのドラッグを始めない（ui/drag.ts）。
        ドラッグできる部品の外（バックアップ）では、付いていても何も起きない
      */}
      <button
        ref={buttonRef}
        type="button"
        className={buttonClassName}
        aria-label={buttonLabel}
        popoverTarget={menuId}
        data-no-drag
      >
        {buttonContent}
      </button>
      <div
        ref={menuRef}
        id={menuId}
        popover="auto"
        className={styles.menu}
        onBeforeToggle={handleBeforeToggle}
        data-no-drag
      >
        <MenuIdContext.Provider value={menuId}>{children}</MenuIdContext.Provider>
      </div>
    </>
  );
}

/**
 * メニューの項目。押すと onSelect を呼び、その後にブラウザがメニューを閉じる（popoverTargetAction="hide"）。
 * disabled のときは押せない（最後のPJTの「削除」）。押せない理由は、下に MenuNote で添える
 */
export function MenuItem({
  onSelect,
  disabled = false,
  children,
}: {
  onSelect: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  const menuId = useContext(MenuIdContext);
  return (
    <button
      type="button"
      className={styles.item}
      popoverTarget={menuId}
      popoverTargetAction="hide"
      disabled={disabled}
      onClick={onSelect}
    >
      {children}
    </button>
  );
}

/** 項目の下に添える説明（押せない理由など） */
export function MenuNote({ children }: { children: ReactNode }) {
  return <p className={styles.note}>{children}</p>;
}
