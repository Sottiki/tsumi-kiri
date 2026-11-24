/**
 * 詳細パネルを開いたときのスクロール量を決める（tasks.md 6-2、SPEC 3.2、決定事項71）
 *
 * ガントの枠（Board の .scroll）の中で、開いたタスクのバーと行が見えるところへスクロールする。
 * 見える範囲は、枠の中から「左に固定したタスク表」「上に固定した見出し」「右に浮かぶ詳細パネル」を除いた部分。
 *
 *   ┌────────────── 枠（scroll） ──────────────────┐
 *   │ 見出し（上に固定）                            │
 *   ├────────────┬──────────────────┬───────────┤
 *   │ タスク表   │   見える範囲      │ 詳細パネル │
 *   │（左に固定）│  ここの中央に置く │（重なる）  │
 *   └────────────┴──────────────────┴───────────┘
 *
 * - 横：バーの真ん中を、見える範囲の中央に置く。バーが見える範囲より長いときは、バーの始まりを左端に合わせる
 * - 縦：行の真ん中を、見える範囲の中央に置く
 * - どちらも、スクロールできる範囲（0〜一番奥）に収める
 *
 * 位置の測り方（DOM）は Board.tsx が受け持ち、ここでは数の計算だけを行う。
 * React にも DOM にも依存しないので、Vitest で確かめられる（tests/ui/scrollToBar.test.ts）。
 */

/**
 * 計算に使う寸法。どれも px で、位置は「枠の中身の左上」からの距離。
 * （画面の上の位置ではなく、スクロールしても変わらない、中身の中での位置）
 */
export interface ScrollGeometry {
  /** 枠の見えている幅・高さ（スクロールバーを除く。clientWidth・clientHeight） */
  viewportWidth: number;
  viewportHeight: number;
  /** 中身の幅・高さ（scrollWidth・scrollHeight）。スクロールできる一番奥を決める */
  contentWidth: number;
  contentHeight: number;
  /** 左に固定しているタスク表の幅 */
  stickyLeft: number;
  /** 上に固定している見出しの高さ */
  stickyTop: number;
  /** 枠の右側のうち、詳細パネルに隠れている幅。パネルが枠に重ならなければ 0 */
  hiddenRight: number;
  /** バーの左端と右端（中身の中での x）。バーのない行（工数 0 など）は null */
  bar: { left: number; right: number } | null;
  /** 行の上端と高さ（中身の中での y） */
  rowTop: number;
  rowHeight: number;
}

/** スクロールする先（scrollLeft・scrollTop に入れる値）。横に動かさないときは left が null */
export interface ScrollTarget {
  left: number | null;
  top: number;
}

/** value を min〜max に収める */
function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function scrollTargetForBar(geometry: ScrollGeometry): ScrollTarget {
  const {
    viewportWidth,
    viewportHeight,
    contentWidth,
    contentHeight,
    stickyLeft,
    stickyTop,
    hiddenRight,
    bar,
    rowTop,
    rowHeight,
  } = geometry;

  // スクロールできる一番奥（中身が枠より小さければ 0）
  const maxLeft = Math.max(0, contentWidth - viewportWidth);
  const maxTop = Math.max(0, contentHeight - viewportHeight);

  // --- 横 ---
  // 見える範囲の幅。scrollLeft を s にすると、中身の x が [s + stickyLeft, s + stickyLeft + visibleWidth) の部分が見える
  let left: number | null = null;
  if (bar !== null) {
    const visibleWidth = viewportWidth - stickyLeft - hiddenRight;
    const barWidth = bar.right - bar.left;
    let wanted: number;
    if (visibleWidth > 0 && barWidth <= visibleWidth) {
      // バーの真ん中が、見える範囲の真ん中に来る s を求める：
      //   s + stickyLeft + visibleWidth / 2 = バーの真ん中
      const barCenter = (bar.left + bar.right) / 2;
      wanted = barCenter - stickyLeft - visibleWidth / 2;
    } else {
      // バーが見える範囲より長い（または見える範囲がない）：バーの始まりを見える範囲の左端に合わせる
      wanted = bar.left - stickyLeft;
    }
    left = clamp(Math.round(wanted), 0, maxLeft);
  }

  // --- 縦 ---
  // 横と同じ考え方。見える範囲は見出しの下から枠の下端まで
  const visibleHeight = viewportHeight - stickyTop;
  const rowCenter = rowTop + rowHeight / 2;
  const wantedTop = rowCenter - stickyTop - visibleHeight / 2;
  const top = clamp(Math.round(wantedTop), 0, maxTop);

  return { left, top };
}
