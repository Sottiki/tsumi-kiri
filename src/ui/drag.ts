/**
 * ドラッグで並べ替えるための共通の部品（段階7で作り、段階8の PJTタブでも使う）
 *
 * タスクの並べ替え（ui/board/useRowDrag.ts）と、PJTタブの並べ替え（ui/tabs/useTabDrag.ts）で、
 * 同じ決まりで掴めるようにするため、ここにまとめる（SPEC 3.1、決定事項73・74・79）。
 *
 * ■ 掴めない場所
 * 入力欄と、ボタンのうち data-no-drag を付けたもの（開閉マーク、タブのメニューのボタン）では掴めない。
 * - 入力欄：押して横へ動かすのは、文字を選ぶ操作。ドラッグにすると、ブラウザの基本の動作を奪ってしまう
 * - 開閉マーク・メニューのボタン：押してすぐ離す操作なので、ドラッグと紛れないように外す
 * タスク名のボタンやタブの名前のボタンは、大きな面なので掴めるようにしておく。
 *
 * ■ クリックとの見分け
 * ドラッグは「押したまま 5px 以上動かした」ときにだけ始める（DRAG_START_DISTANCE）。
 * 動かさずに離したら、ふつうのクリックになる（詳細パネルを開く、タブを切り替える）。
 * ドラッグした後のクリックは、dnd-kit が止めてくれるので、落としたときにクリックの動きは起きない。
 *
 * ■ キーボード
 * dnd-kit の KeyboardSensor は使わない（決定事項74）。
 * Space や矢印キーを奪うと、ブラウザの基本の操作（ボタンを押す・スクロールする）が変わってしまうため。
 */

import {
  PointerSensor,
  useSensor,
  useSensors,
  type Modifier,
  type PointerSensorOptions,
} from '@dnd-kit/core';
import { useEffect, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';

/** ドラッグを始めるまでに動かす距離（px）。これより短ければクリック（決定事項73） */
export const DRAG_START_DISTANCE = 5;

/** ここを押したときはドラッグを始めない */
const NOT_DRAGGABLE = 'input, textarea, select, [data-no-drag]';

export class DragPointerSensor extends PointerSensor {
  /**
   * dnd-kit が、ドラッグできる部品の onPointerDown として呼ぶ関数。
   * true を返すとドラッグの準備を始め（5px 動いたら始まる）、false なら何もしない。
   * 中身は PointerSensor の元の関数と同じで、掴めない場所の判定だけを足している。
   */
  static override activators = [
    {
      eventName: 'onPointerDown' as const,
      handler: (
        { nativeEvent: event }: ReactPointerEvent,
        { onActivation }: PointerSensorOptions,
      ): boolean => {
        // 左ボタン（タッチなら最初の指）で押したときだけ。右クリックでは掴まない
        if (!event.isPrimary || event.button !== 0) return false;
        // 入力欄・開閉マークの上で押したときは、その部品の操作に任せる
        const target = event.target as Element | null;
        if (target?.closest(NOT_DRAGGABLE)) return false;
        onActivation?.({ event });
        return true;
      },
    },
  ];
}

/** マウスで掴む部品を、dnd-kit の DndContext に渡す形にする。5px 動かしたらドラッグを始める */
export function useDragSensors() {
  return useSensors(
    useSensor(DragPointerSensor, { activationConstraint: { distance: DRAG_START_DISTANCE } }),
  );
}

/**
 * ドラッグ中の Esc は、ドラッグの取りやめだけにする（SPEC 3.1：Esc では何も変わらない）。
 *
 * 詳細パネルは window で Esc を受けて閉じる（DetailPanel.tsx）。dnd-kit は document で受けて取りやめる。
 * document で伝わるのを止めれば、dnd-kit には届き、window（パネル）には届かない。
 * stopPropagation は同じ document の上のほかの受け手（dnd-kit）は止めないので、登録の順番は気にしなくてよい。
 *
 * @param draggingRef ドラッグ中なら true。ドラッグを始めた・終えたときに、呼ぶ側が書き換える
 */
export function useStopEscapeWhileDragging(draggingRef: RefObject<boolean>) {
  useEffect(() => {
    const stopEscapeWhileDragging = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && draggingRef.current) event.stopPropagation();
    };
    document.addEventListener('keydown', stopEscapeWhileDragging);
    return () => document.removeEventListener('keydown', stopEscapeWhileDragging);
  }, [draggingRef]);
}

/**
 * 写しを縦にだけ動かす（dnd-kit の modifier）。タスクの並べ替えで使う。
 * 並べ替えは縦の並びだけなので、写しが横にずれると、どこへ落ちるのかが分かりにくくなるため。
 */
export const keepVertical: Modifier = ({ transform }) => ({ ...transform, x: 0 });

/** 写しを横にだけ動かす。PJTタブの並べ替えで使う（タブは横に並ぶため） */
export const keepHorizontal: Modifier = ({ transform }) => ({ ...transform, y: 0 });
