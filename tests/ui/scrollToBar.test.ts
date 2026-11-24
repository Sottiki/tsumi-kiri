/**
 * 詳細パネルを開いたときのスクロール量（src/ui/board/scrollToBar.ts）のテスト。
 *
 * 寸法は画面に近い値にする：枠の幅 1462px（1512 − 左右 24px − 枠線）、
 * タスク表 820px、見出し 66px（22px × 3段）、パネルに隠れる幅 492px（460 + 16 × 2）。
 * このとき、横に見える範囲は 1462 − 820 − 492 = 150px。
 */

import { describe, expect, it } from 'vitest';
import { scrollTargetForBar, type ScrollGeometry } from '../../src/ui/board/scrollToBar';

/** 基本の寸法。テストごとに一部だけを変える */
const BASE: ScrollGeometry = {
  viewportWidth: 1462,
  viewportHeight: 600,
  contentWidth: 820 + 80 * 22, // 80日ぶん
  contentHeight: 66 + 30 * 40, // 30行ぶん
  stickyLeft: 820,
  stickyTop: 66,
  hiddenRight: 492,
  bar: { left: 820 + 40 * 22, right: 820 + 42 * 22 }, // 41日目から2マス
  rowTop: 66 + 20 * 40,
  rowHeight: 40,
};

describe('横', () => {
  it('バーの真ん中を、タスク表とパネルの間の真ん中に置く', () => {
    const { left } = scrollTargetForBar(BASE);
    // 見える範囲の真ん中は、枠の左から 820 + 150 / 2 = 895px
    const barCenter = (BASE.bar!.left + BASE.bar!.right) / 2;
    expect(left).toBe(barCenter - 895);
  });

  it('バーが見える範囲より長いときは、バーの始まりを見える範囲の左端に合わせる', () => {
    const { left } = scrollTargetForBar({
      ...BASE,
      bar: { left: 820 + 10 * 22, right: 820 + 30 * 22 }, // 20マス = 440px > 150px
    });
    expect(left).toBe(10 * 22);
  });

  it('パネルが重なっていなければ、枠の右端までを見える範囲にする', () => {
    const { left } = scrollTargetForBar({ ...BASE, hiddenRight: 0 });
    // 見える範囲は 1462 − 820 = 642px。真ん中は 820 + 321
    const barCenter = (BASE.bar!.left + BASE.bar!.right) / 2;
    expect(left).toBe(barCenter - 820 - 321);
  });

  it('左端より前や、一番奥より先にはスクロールしない', () => {
    const atStart = scrollTargetForBar({ ...BASE, bar: { left: 820, right: 842 } });
    expect(atStart.left).toBe(0);
    const atEnd = scrollTargetForBar({
      ...BASE,
      bar: { left: BASE.contentWidth - 22, right: BASE.contentWidth },
    });
    expect(atEnd.left).toBe(BASE.contentWidth - BASE.viewportWidth);
  });

  it('バーのない行（工数 0）は、横に動かさない', () => {
    expect(scrollTargetForBar({ ...BASE, bar: null }).left).toBeNull();
  });
});

describe('縦', () => {
  it('行の真ん中を、見出しより下の見える範囲の真ん中に置く', () => {
    const { top } = scrollTargetForBar(BASE);
    // 見える範囲は 600 − 66 = 534px。真ん中は枠の上から 66 + 267
    expect(top).toBe(BASE.rowTop + 20 - 66 - 267);
  });

  it('上の端の行は、一番上より上にはスクロールしない', () => {
    expect(scrollTargetForBar({ ...BASE, rowTop: 66 }).top).toBe(0);
  });
});
