import { DEMO_EXISTING_PLANS, formatPlanDateLine, groupPlansByYearMonth } from './planData';
import styles from './plan-page.module.css';

export default function PlanPage() {
  const grouped = groupPlansByYearMonth(DEMO_EXISTING_PLANS);

  return (
    <div className={styles.root}>
      <div className={styles.split}>
        <PlanDraftPanel />
        <PlanTimelinePanel grouped={grouped} />
      </div>
    </div>
  );
}

function PlanDraftPanel() {
  return (
    <section className={styles.draftCol} aria-label="制定计划">
      <h1 className={styles.draftTitle}>制定计划</h1>
      <p className={styles.draftHint}>左侧为规划区，后续可在此编辑行程、日期与同行人。当前仅占位。</p>
      <div className={styles.draftBlank} />
    </section>
  );
}

function PlanTimelinePanel({
  grouped,
}: {
  grouped: ReturnType<typeof groupPlansByYearMonth>;
}) {
  return (
    <section className={styles.timelineCol} aria-label="我的计划">
      <div className={styles.timelineTrack}>
        <h2 className={styles.timelineHeading}>我的计划</h2>
        {grouped.length === 0 ? (
          <p className={styles.emptyRight}>暂无计划</p>
        ) : (
          grouped.map((yb) => (
            <div key={yb.year} className={styles.yearBlock}>
              <p className={styles.yearLabel}>{yb.year}</p>
              {yb.months.map((mb) => (
                <div key={`${yb.year}-${mb.month}`} className={styles.monthBlock}>
                  <p className={styles.monthLabel}>{mb.month}月</p>
                  {mb.items.map((item, idx) => (
                    <div key={`${yb.year}-${mb.month}-${idx}-${item.title}`} className={styles.planRow}>
                      <span className={styles.dateLine}>{formatPlanDateLine(item)}</span>
                      <p className={styles.planTitle}>{item.title}</p>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ))
        )}
      </div>
    </section>
  );
}
