/**
 * タスク表とガントの見出し（tasks.md 4-5、SPEC 3.1「右：ガント」）
 *
 * 左：タスク表の列見出し（ID、工程 / タスク、優先、工数、進捗、残工数、開始、終了、期日、状態）
 * 右：ガントの見出し3段
 *   1段目 月  ：最初の日と、毎月1日にだけ「12月」と出す
 *   2段目 曜日：日曜・祝日は赤系、土曜は青系の文字
 *   3段目 日付：祝日・休業日は日付の代わりに「休」。今日は濃い黄色
 * 土日祝の列はグレー、今日の列は黄色、エンド日の列の右には赤い線を引く。
 */

import { dayOfMonth, dayOfWeek, monthOf, weekdayLabel } from '../../core/calendar';
import type { DateString, GanttDay } from '../../core/types';
import { cx } from '../cx';
import styles from './Board.module.css';

interface BoardHeaderProps {
  days: readonly GanttDay[];
  today: DateString;
  endDate: DateString | null;
}

/** 曜日の文字の色。日曜と「休」の日は赤系、土曜は青系、ほかは普通の色 */
function weekdayColorClass(day: GanttDay): string | null {
  if (day.kind === 'off' || dayOfWeek(day.date) === 0) return styles.sunday ?? null;
  if (dayOfWeek(day.date) === 6) return styles.saturday ?? null;
  return null;
}

export function BoardHeader({ days, today, endDate }: BoardHeaderProps) {
  /** 曜日・日付の段に共通の、列の色と線のクラス */
  const columnClass = (day: GanttDay) =>
    cx(
      day.kind !== 'work' && styles.dayOff,
      day.kind === 'work' && day.date === today && styles.today,
      day.date === endDate && styles.endLine,
    );

  return (
    <div className={styles.headerRow}>
      <div className={styles.headLeft}>
        <div className={styles.colId}>ID</div>
        <div className={styles.colName}>工程 / タスク</div>
        <div className={styles.colPriority}>優先</div>
        <div className={styles.colNumber}>工数</div>
        <div className={styles.colProgress}>進捗</div>
        <div className={styles.colNumber}>残工数</div>
        <div className={styles.colDate}>開始</div>
        <div className={styles.colDate}>終了</div>
        <div className={styles.colDate}>期日</div>
        <div className={styles.colStatus}>状態</div>
      </div>

      <div className={styles.headRight} aria-hidden="true">
        {/* aria-hidden：1日ずつの見出しは、読み上げると数十個の数字が続くだけなので外す */}
        <div className={styles.dayRow}>
          {days.map((day, index) => (
            <div key={day.date} className={styles.monthHead}>
              {index === 0 || dayOfMonth(day.date) === 1 ? `${monthOf(day.date)}月` : ''}
            </div>
          ))}
        </div>
        <div className={styles.dayRow}>
          {days.map((day) => (
            <div
              key={day.date}
              className={cx(styles.weekdayHead, columnClass(day), weekdayColorClass(day))}
            >
              {weekdayLabel(day.date)}
            </div>
          ))}
        </div>
        <div className={styles.dayRow} data-testid="date-head-row">
          {days.map((day) => (
            <div
              key={day.date}
              className={cx(
                styles.dateHead,
                columnClass(day),
                weekdayColorClass(day),
                // 今日の日付は、列の黄色より濃い黄色にする（today-head）
                day.date === today && styles.todayHead,
              )}
            >
              {day.kind === 'off' ? '休' : dayOfMonth(day.date)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
