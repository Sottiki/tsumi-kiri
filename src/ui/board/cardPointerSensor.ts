/**
 * カードを掴むための、マウス（ポインタ）の部品（tasks.md 7-1、SPEC 3.1、決定事項73・74）
 *
 * dnd-kit の PointerSensor をもとに、「どこを押したらドラッグを始めてよいか」だけを変える。
 *
 * ■ 掴めない場所
 * カードの中の入力欄（工数・進捗率）と、開閉マークでは掴めないようにする。
 * - 入力欄：押して横へ動かすのは、文字を選ぶ操作。ドラッグにすると、ブラウザの基本の動作を奪ってしまう
 * - 開閉マーク：押してすぐ離す操作なので、ドラッグと紛れないように外す
 * 開閉マークのように、ボタンのうち掴めないものには data-no-drag を付ける。
 * タスク名のボタン（詳細パネルを開く）は、カードの大きな面なので掴めるようにしておく。
 *
 * ■ クリックとの見分け
 * ドラッグは「押したまま 5px 以上動かした」ときにだけ始める（Board.tsx の activationConstraint）。
 * 動かさずに離したら、ふつうのクリックになり、詳細パネルが開く（決定事項62）。
 * ドラッグした後のクリックは、dnd-kit が止めてくれるので、落としたときにパネルは開かない。
 *
 * ■ キーボード
 * dnd-kit の KeyboardSensor は使わない（決定事項74）。
 * Space や矢印キーを奪うと、ブラウザの基本の操作（ボタンを押す・スクロールする）が変わってしまうため。
 */

import { PointerSensor, type PointerSensorOptions } from '@dnd-kit/core';
import type { PointerEvent as ReactPointerEvent } from 'react';

/** ここを押したときはドラッグを始めない */
const NOT_DRAGGABLE = 'input, textarea, select, [data-no-drag]';

export class CardPointerSensor extends PointerSensor {
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
