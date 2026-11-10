import { useId } from "react";
import type { Breakdown } from "../../lib/analytics/queries";
import styles from "./Dashboard.module.css";

export default function BreakdownChart({ title, rows }: { title: string; rows: Breakdown[] }) {
  const captionId = useId();
  const ranked = rows.filter((row) => Number.isFinite(row.events) && row.events > 0)
    .toSorted((left, right) => right.events - left.events || left.label.localeCompare(right.label))
    .slice(0, 5);
  const maximum = ranked[0]?.events || 1;
  return <figure className={styles.chart} aria-labelledby={captionId}>
    <figcaption id={captionId}><h3>{title}</h3><span>Events · top {ranked.length || 5} groups</span></figcaption>
    {!ranked.length ? <p className={styles.muted}>No matching events to chart.</p> :
      <ol className={styles.chartRows}>
        {ranked.map((row) => <li key={row.label}>
          <div className={styles.chartLabel}><span>{row.label}</span><strong>{row.events.toLocaleString("en-US")}</strong></div>
          <svg viewBox="0 0 100 6" preserveAspectRatio="none" aria-hidden="true" focusable="false">
            <rect width="100" height="6" rx="3" className={styles.chartTrack} />
            <rect width={row.events / maximum * 100} height="6" rx="3" className={styles.chartBar} />
          </svg>
        </li>)}
      </ol>}
    <p className={styles.chartNote}>Matching event counts from the report breakdown, independent of the journey display cap.</p>
  </figure>;
}
