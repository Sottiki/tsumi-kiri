/**
 * ファイルをダウンロードさせる（tasks.md 9-5、architecture.md 9章）
 *
 * ■ しくみ（Blob とリンクのクリック）
 * 1. ファイルの中身（Blob）に、ブラウザの中だけで使える URL（`blob:...`）を付ける
 * 2. その URL を指す `<a download="ファイル名">` を作り、プログラムからクリックする
 * 3. ブラウザは「リンク先をこの名前で保存する」と受け取り、ダウンロードが始まる
 *
 * サーバーを使わないので、ビルドした1つの HTML を `file://` で開いたときでも動く。
 *
 * 段階8のバックアップの書き出し（JSON ファイル。ui/BackupMenu.tsx）でも、同じ関数を使う。
 */

/**
 * blob の URL を消すまでの待ち時間（ミリ秒）。
 *
 * URL を消すと、その URL からはファイルを読めなくなる。クリックした直後に消すと、
 * ブラウザによってはダウンロードが始まる前に読めなくなることがあるので、少し待ってから消す。
 * 消さないままだと、ページを閉じるまで Blob がメモリに残る。
 */
const REVOKE_DELAY_MS = 10_000;

/**
 * Blob を、決めたファイル名でダウンロードさせる。
 *
 * @param blob ファイルの中身
 * @param fileName 保存するときのファイル名（例：`工数ガント_社内ポータル刷新_2026-11-23.xlsx`）
 */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  // 画面には出さないリンクなので、ページに足してクリックしたら、すぐ取り除く。
  // （Firefox の古い版は、ページに入っていないリンクのクリックを無視するため、いったん足す）
  link.style.display = 'none';
  document.body.append(link);
  link.click();
  link.remove();

  setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS);
}
