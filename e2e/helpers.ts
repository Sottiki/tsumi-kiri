/**
 * 画面のテストで共通に使う関数。
 *
 * 時計を画面案と同じ「2026-11-19(木) 東京」に止めて開く。
 * サンプルPJTの開始日は「開いた日を含む週の月曜」なので 2026-11-16 になり、
 * 画面案・docs/test-cases.md 1章と同じ日程・カードの値になる。
 * 時計を止めても、タイマー（setTimeout）は動き続ける（ハイライトが消えるのを確かめられる）。
 */

import type { Page } from '@playwright/test';

/** 時計を止めてから開く。毎回まっさらなブラウザなので、保存データはなくサンプルPJTで始まる */
export async function openOnMockupDay(page: Page) {
  await page.clock.setFixedTime(new Date('2026-11-19T10:00:00+09:00'));
  await page.goto('/');
  // 書体（Google Fonts）が後から読み込まれると、文字の高さが変わって部品の位置がずれる。
  // 位置を比べるテストがあるので、書体の読み込みが終わるまで待つ
  await page.evaluate(() => document.fonts.ready);
}

/** 行（data-testid="row-<ID>"） */
export const row = (page: Page, label: string) => page.getByTestId(`row-${label}`);
