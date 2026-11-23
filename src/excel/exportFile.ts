/**
 * Excel のファイルを作る（tasks.md 9-5、architecture.md 9章）
 *
 * workbook.ts の buildWorkbook が作った「メモリの上のブック」を、`.xlsx` のファイルの中身（Blob）にして、
 * ファイル名（fileName.ts）と組にして返す。
 *
 * ダウンロード（リンクを作ってクリックする）は画面の仕事なので、ui/download.ts で行う。
 * excel/ は store も ui も使わない決まり（architecture.md 2章の依存の向き）なので、
 * ここでは「何を出すか」を引数で受け取り、DOM には触らない。
 */

import type { DateString, DayOff, Project } from '../core/types';
import { excelFileName } from './fileName';
import { buildWorkbook } from './workbook';

/**
 * `.xlsx` の MIME タイプ（ファイルの種類を表す文字）。
 * Blob に付けておくと、ブラウザや OS が「Excel のファイル」として扱える。
 */
export const XLSX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** ダウンロードするファイル：名前と中身 */
export interface ExcelFile {
  fileName: string;
  blob: Blob;
}

/**
 * 表示中のPJTから、ダウンロードする Excel のファイルを作る。
 *
 * @param project 出力するPJT（表示中のPJTだけを出す。SPEC 3.3）
 * @param daysOff 休業日・有給の一覧（全PJT共通）
 * @param today 今日の日付。ブックの完了予定の計算と、ファイル名の出力日の両方に使う
 *
 * ファイルの中身を作る `writeBuffer` は時間がかかることがあるので、Promise を返す（async）。
 * 呼ぶ側は `await` で、でき上がるのを待つ。
 */
export async function createExcelFile(
  project: Project,
  daysOff: readonly DayOff[],
  today: DateString,
): Promise<ExcelFile> {
  const workbook = buildWorkbook(project, daysOff, today);

  // ブックを、.xlsx ファイルのバイト列にする
  const buffer = await workbook.xlsx.writeBuffer();

  // バイト列を Blob（ブラウザでファイルの中身を表す入れ物）に包む
  const blob = new Blob([buffer], { type: XLSX_MIME_TYPE });

  return { fileName: excelFileName(project.name, today), blob };
}
