/**
 * Excel出力の色（src/excel/colors.ts）が、DESIGN.md のトークンと同じかを確かめる。
 *
 * colors.ts は DESIGN.md の色を手で書き写したもの（architecture.md 8章）。
 * 書き写し間違いや、DESIGN.md だけを直して colors.ts を直し忘れたときに、このテストが落ちる。
 */

import { describe, expect, it } from 'vitest';
// '?raw' を付けると、Vite（Vitest）がファイルの中身を文字列として読み込む
import designMd from '../DESIGN.md?raw';
import { EXCEL_COLORS, argb, type ExcelColorToken } from '../src/excel/colors';

/**
 * DESIGN.md の先頭の YAML から、colors の部分だけを取り出して { トークン名: '#RRGGBB' } にする。
 *
 * YAML の読み込みのためにライブラリを足さないよう、決まった形の行だけを読む：
 *   colors:
 *     primary: "#1D4ED8"
 *     ...
 *   typography:        ← 次の見出しで colors の部分は終わり
 */
function readDesignColors(markdown: string): Map<string, string> {
  const lines = markdown.split('\n');
  const start = lines.indexOf('colors:');
  if (start === -1) {
    throw new Error('DESIGN.md に colors: がありません');
  }

  const colors = new Map<string, string>();
  for (const line of lines.slice(start + 1)) {
    // 行頭に空白がない行（typography: など）が来たら、colors の部分は終わり
    if (/^\S/.test(line)) {
      break;
    }
    // '  primary: "#1D4ED8"' の形の行から、名前と色を取り出す。コメントの行は形が違うので読み飛ばす
    const match = /^\s+([a-z0-9-]+):\s*"(#[0-9A-Fa-f]{6})"/.exec(line);
    if (match !== null) {
      colors.set(match[1] as string, (match[2] as string).toUpperCase());
    }
  }
  return colors;
}

describe('Excel出力の色', () => {
  const designColors = readDesignColors(designMd);

  it('DESIGN.md から色を読み取れている', () => {
    // 読み取りに失敗して空のまま、すべて通ってしまうのを防ぐ
    expect(designColors.get('primary')).toBe('#1D4ED8');
  });

  for (const [token, hex] of Object.entries(EXCEL_COLORS)) {
    it(`${token} は DESIGN.md と同じ値`, () => {
      expect(designColors.get(token)).toBe(hex.toUpperCase());
    });
  }

  it("argb() は '#' を取り、不透明の 'FF' を先頭に付ける", () => {
    expect(argb('primary' satisfies ExcelColorToken)).toBe('FF1D4ED8');
  });
});
