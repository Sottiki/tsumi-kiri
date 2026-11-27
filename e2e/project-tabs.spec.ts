/**
 * PJTタブ（tasks.md 8-1、決定事項16・76〜80）の画面のテスト。
 *
 * サンプルPJT「社内ポータル刷新」（docs/test-cases.md 1章。タスク 13件）から始める。
 * PJTの追加・切り替え・削除（確認付き、最後の1つは消せない）・ドラッグでの並べ替えと、
 * それぞれを元に戻せることを確かめる。
 */

import type { Page } from '@playwright/test';
import { expect, openOnMockupDay, test } from './helpers';

const SAMPLE_NAME = '社内ポータル刷新';

/** タブの帯 */
const tabBar = (page: Page) => page.getByRole('navigation', { name: 'PJT' });
/** タブの名前のボタン（押すと切り替わる） */
const tab = (page: Page, name: string) => tabBar(page).getByRole('button', { name, exact: true });
/** タブの名前の並び（左から） */
async function tabNames(page: Page): Promise<string[]> {
  return tabBar(page).locator('[data-project-id] > button:first-child').allInnerTexts();
}
/** 上部のPJT名の欄 */
const nameInput = (page: Page) => page.getByLabel('PJT名');
/** 上部のカード（総工数・エンド日・完了予定） */
const summary = (page: Page) => page.getByRole('region', { name: 'PJTの概要' });

/**
 * 「＋」でPJTを足し、名前を打つ。
 * 足した後、次の描画のときにPJT名の欄が選ばれるので、欄にカーソルが入るのを待ってから打つ
 */
async function addProjectNamed(page: Page, name: string) {
  await tabBar(page).getByRole('button', { name: 'PJTを追加' }).click();
  await expect(nameInput(page)).toBeFocused();
  await page.keyboard.type(name);
  await expect(tab(page, name)).toBeVisible();
}

test('「＋」でPJTを足すと、PJT名の欄が選ばれ、打った名前がタブに出る。切り替えると上部とカードが変わる', async ({
  page,
}) => {
  await openOnMockupDay(page);
  await expect(tab(page, SAMPLE_NAME)).toHaveAttribute('aria-current', 'page');

  await tabBar(page).getByRole('button', { name: 'PJTを追加' }).click();
  // 足したPJTが表示中になり、PJT名の欄にカーソルが入って、名前が選ばれている（決定事項80）
  await expect(tab(page, '新しいPJT')).toHaveAttribute('aria-current', 'page');
  await expect(nameInput(page)).toBeFocused();
  await expect(nameInput(page)).toHaveValue('新しいPJT');
  // 選ばれた状態で打つと、名前が置き換わる
  await page.keyboard.type('第2期');
  await expect(tab(page, '第2期')).toBeVisible();
  // 新しいPJTはタスクがなく、エンド日も空欄（SPEC 3.1）
  await expect(summary(page)).toContainText('0.0人日');
  await expect(summary(page)).toContainText('エンド日未設定');

  // サンプルのタブに切り替えると、上部とカードがサンプルに戻る
  await tab(page, SAMPLE_NAME).click();
  await expect(tab(page, SAMPLE_NAME)).toHaveAttribute('aria-current', 'page');
  await expect(nameInput(page)).toHaveValue(SAMPLE_NAME);
  await expect(summary(page)).toContainText('33.5人日');

  // タブの切り替えは元に戻すの対象ではない。Ctrl+Z は名前の変更（第2期）を戻す
  await page.keyboard.press('Control+z');
  await expect(tab(page, SAMPLE_NAME)).toHaveAttribute('aria-current', 'page');
  await expect(tab(page, '新しいPJT')).toBeVisible();
});

test('メニューの「削除」で、確認を出してからPJTを削除する。Ctrl+Z で戻る', async ({ page }) => {
  await openOnMockupDay(page);
  await tabBar(page).getByRole('button', { name: 'PJTを追加' }).click();
  await expect(tab(page, '新しいPJT')).toBeVisible();

  // 表示中でないタブ（サンプル）のメニューを開いても、タブは切り替わらない（決定事項77）
  await tabBar(page)
    .getByRole('button', { name: `「${SAMPLE_NAME}」のメニュー` })
    .click();
  await expect(tab(page, '新しいPJT')).toHaveAttribute('aria-current', 'page');
  await page.getByRole('button', { name: '削除' }).click();

  // 確認には、PJT名とタスクの件数が出る（決定事項78）
  const dialog = page.getByRole('dialog', { name: `「${SAMPLE_NAME}」を削除しますか？` });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('タスク13件も一緒に削除されます。');

  // キャンセルでは消えない
  await dialog.getByRole('button', { name: 'キャンセル' }).click();
  await expect(dialog).toBeHidden();
  expect(await tabNames(page)).toEqual([SAMPLE_NAME, '新しいPJT']);

  // 削除すると、タブが消える
  await tabBar(page)
    .getByRole('button', { name: `「${SAMPLE_NAME}」のメニュー` })
    .click();
  await page.getByRole('button', { name: '削除' }).click();
  await page.getByRole('dialog').getByRole('button', { name: '削除' }).click();
  expect(await tabNames(page)).toEqual(['新しいPJT']);

  // Ctrl+Z で、削除したPJTが戻る
  await page.keyboard.press('Control+z');
  await expect(tab(page, SAMPLE_NAME)).toBeVisible();
  expect(await tabNames(page)).toEqual([SAMPLE_NAME, '新しいPJT']);
});

test('PJTが1つだけのときは「削除」を押せず、理由が出る', async ({ page }) => {
  await openOnMockupDay(page);
  await tabBar(page)
    .getByRole('button', { name: `「${SAMPLE_NAME}」のメニュー` })
    .click();
  await expect(page.getByRole('button', { name: '削除' })).toBeDisabled();
  await expect(page.getByText('最後のPJTは削除できません')).toBeVisible();
  // Esc でメニューが閉じる（ブラウザの popover の動き）
  await page.keyboard.press('Escape');
  await expect(page.getByText('最後のPJTは削除できません')).toBeHidden();
});

test('タブをドラッグして並べ替えると、線が出て、離すと順番が変わる。Ctrl+Z で戻る', async ({
  page,
}) => {
  await openOnMockupDay(page);
  await addProjectNamed(page, 'B');
  await addProjectNamed(page, 'C');
  expect(await tabNames(page)).toEqual([SAMPLE_NAME, 'B', 'C']);

  // C のタブを掴んで、先頭のタブの左端あたりまで動かす（まだ離さない）
  const from = await tab(page, 'C').boundingBox();
  const to = await tab(page, SAMPLE_NAME).boundingBox();
  if (from === null || to === null) throw new Error('タブが画面にありません');
  const y = from.y + from.height / 2;
  await page.mouse.move(from.x + 10, y);
  await page.mouse.down();
  await page.mouse.move(to.x + 5, y, { steps: 12 });

  // 落とす位置（先頭のタブの左端）に青い縦線が1本出る
  const line = page.locator('[data-drop-edge]');
  await expect(line).toHaveCount(1);
  await expect(line).toHaveAttribute('data-drop-edge', 'before');

  await page.mouse.up();
  expect(await tabNames(page)).toEqual(['C', SAMPLE_NAME, 'B']);
  await expect(line).toHaveCount(0);
  // 落としたときのクリックで、タブは切り替わらない（C は足した直後から表示中のまま）
  await expect(tab(page, 'C')).toHaveAttribute('aria-current', 'page');

  await page.keyboard.press('Control+z');
  expect(await tabNames(page)).toEqual([SAMPLE_NAME, 'B', 'C']);
});
