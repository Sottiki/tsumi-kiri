/**
 * 上部のカード4枚（tasks.md 4-2、SPEC 3.1「カード」）
 *
 * 1. 総工数（残工数と進捗%）
 * 2. エンド日（今日から何営業日あるか）
 * 3. 完了予定（通常 8h）
 * 4. 完了予定（残業 10h）。通常より何営業日短くなるかも添える
 *
 * 値はストアの計算結果（computed.cards。core/schedule.ts の summarizeCards が作る）を出すだけで、
 * ここでは計算しない。
 *
 * 完了予定のカードの色：
 * - エンド日に間に合う → 緑（stat-card-on-time）「エンド日に間に合う」
 * - 超える           → 赤（stat-card-over）「エンド日を ○ 営業日超過」
 * - エンド日が空欄     → 白（stat-card）「エンド日未設定」（SPEC 3.1：超過の判定をしない）
 * - タスクがない       → 白（stat-card）、値は「—」、「タスクなし」
 */

import { displayProgressPct } from '../core/schedule';
import { formatMonthDay, formatMonthDayWeekday, weekdayLabel } from '../core/calendar';
import type { FinishForecast } from '../core/types';
import { useAppStore } from '../store';
import { formatTenths } from './format';
import styles from './SummaryCards.module.css';

/** 値がないときに出す記号 */
const NO_VALUE = '—';

export function SummaryCards() {
  const cards = useAppStore((state) => state.computed.cards);

  return (
    <section className={styles.cards} aria-label="PJTの概要">
      {/* 1. 総工数 */}
      <div className={styles.card}>
        <div className={styles.label}>総工数</div>
        <div className={styles.value}>
          {formatTenths(cards.totalEffortTenths)}
          <span className={styles.unit}>人日</span>
        </div>
        <div className={styles.note}>
          残工数 {formatTenths(cards.remainingTenths)} 人日（進捗{' '}
          {displayProgressPct(cards.progressPct)}%）
        </div>
      </div>

      {/* 2. エンド日 */}
      <div className={styles.card}>
        <div className={styles.label}>エンド日</div>
        {cards.endDate === null ? (
          <>
            <div className={styles.value}>{NO_VALUE}</div>
            <div className={styles.note}>エンド日未設定</div>
          </>
        ) : (
          <>
            <div className={styles.value}>
              {formatMonthDay(cards.endDate)}
              {/* 曜日だけは本文の書体で小さく出す（画面案のとおり） */}
              <span className={styles.unit}>({weekdayLabel(cards.endDate)})</span>
            </div>
            <div className={styles.note}>今日から {cards.workdaysUntilEnd} 営業日</div>
          </>
        )}
      </div>

      {/* 3・4. 完了予定 */}
      <ForecastCard label="完了予定（通常 8h）" forecast={cards.normal} />
      <ForecastCard
        label="完了予定（残業 10h）"
        forecast={cards.overtime}
        shortenedWorkdays={cards.shortenedWorkdays}
      />
    </section>
  );
}

interface ForecastCardProps {
  label: string;
  forecast: FinishForecast;
  /** 残業のカードだけに渡す。残業なら何営業日短くなるか（タスクがなければ null） */
  shortenedWorkdays?: number | null;
}

/** 完了予定のカード1枚 */
function ForecastCard({ label, forecast, shortenedWorkdays }: ForecastCardProps) {
  const { finishDate, overrunWorkdays } = forecast;

  // カードの色と、数値の下の補足を決める
  let tone: 'neutral' | 'onTime' | 'over';
  let note: string;
  if (finishDate === null) {
    tone = 'neutral';
    note = 'タスクなし';
  } else if (overrunWorkdays === null) {
    // 完了予定日があるのに超過日数が null なのは、エンド日が空欄のとき（summarizeCards の決まり）
    tone = 'neutral';
    note = 'エンド日未設定';
  } else if (overrunWorkdays === 0) {
    tone = 'onTime';
    note = 'エンド日に間に合う';
  } else {
    tone = 'over';
    note = `エンド日を ${overrunWorkdays} 営業日超過`;
  }

  // tone ごとのクラス。neutral は普通の白いカード
  const toneClass = { neutral: styles.card, onTime: styles.cardOnTime, over: styles.cardOver }[
    tone
  ];

  return (
    <div className={toneClass} data-testid={label}>
      <div className={styles.label}>{label}</div>
      <div className={styles.value}>
        {finishDate === null ? NO_VALUE : formatMonthDayWeekday(finishDate)}
      </div>
      <div className={tone === 'neutral' ? styles.note : styles.judgement}>{note}</div>
      {/* 残業のカードだけ、2行目に短縮日数を添える（SPEC 3.1） */}
      {shortenedWorkdays !== undefined && shortenedWorkdays !== null && (
        <div className={styles.note}>残業なら {shortenedWorkdays} 営業日短縮</div>
      )}
    </div>
  );
}
