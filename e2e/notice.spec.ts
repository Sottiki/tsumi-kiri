/**
 * 知らせ（tasks.md 8-4、SPEC 6章、決定事項44・84）の画面のテスト。
 *
 * 保存の失敗と、保存データの読み込みの失敗を、画面の左下に出し、閉じられることを確かめる。
 * （Excel出力の失敗は e2e/excel-export.spec.ts、バックアップの読み込みの失敗は e2e/backup.spec.ts で確かめる）
 *
 * 失敗は、ページが開く前に動く script（addInitScript）で、localStorage を壊したり、書き込めなくしたりして起こす。
 */

import { STORAGE_KEY } from '../src/store/persistence';
import { expect, openOnMockupDay, test } from './helpers';

test('保存に失敗すると、左下に知らせが出て、閉じるボタンで消える', async ({ page }) => {
  // localStorage への書き込みを、容量が足りないときと同じように失敗させる
  await page.addInitScript((key) => {
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (name: string, value: string) {
      if (name === key) throw new DOMException('容量が足りない（テスト）', 'QuotaExceededError');
      setItem.call(this, name, value);
    };
  }, STORAGE_KEY);
  await openOnMockupDay(page);
  await expect(page.getByTestId('notice')).toHaveCount(0);

  // 何か変えると、少し後（約0.3秒）に保存しようとして失敗する
  await page.getByLabel('要件定義書作成の工数（人日）').fill('1.0');
  const notice = page.getByTestId('notice');
  await expect(notice).toHaveText(
    'データを保存できませんでした。バックアップを書き出しておいてください。',
  );
  await expect(notice).toHaveAttribute('data-kind', 'save-error');

  // 左下に出る（右に出る詳細パネルと重ならないように。決定事項84）
  const box = await notice.boundingBox();
  const viewport = page.viewportSize();
  if (box === null || viewport === null) throw new Error('知らせが画面にありません');
  expect(box.x).toBeLessThan(viewport.width / 2);
  expect(box.y + box.height).toBeGreaterThan(viewport.height - 40);

  await notice.getByRole('button', { name: '知らせを閉じる' }).click();
  await expect(notice).toHaveCount(0);
});

test('保存データが壊れていたら、開いたときに理由を知らせ、サンプルPJTで始める', async ({
  page,
}) => {
  await page.addInitScript((key) => {
    // 一度だけ壊れたデータを入れる（読み込みの後に、アプリがサンプルで書き直すので、毎回は入れない）
    if (sessionStorage.getItem('broken-written') === null) {
      localStorage.setItem(key, '{ 壊れたデータ');
      sessionStorage.setItem('broken-written', 'yes');
    }
  }, STORAGE_KEY);
  await openOnMockupDay(page);

  const notice = page.getByTestId('notice');
  await expect(notice).toContainText('保存されていたデータを読み込めませんでした');
  await expect(notice).toContainText('サンプルのPJTで始めます。');
  await expect(notice).toHaveAttribute('data-kind', 'load-error');
  await expect(page.getByLabel('PJT名')).toHaveValue('社内ポータル刷新');
});
