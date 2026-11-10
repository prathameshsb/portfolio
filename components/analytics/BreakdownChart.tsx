import { useId } from "react";
import type { Breakdown } from "../../lib/analytics/queries";
import styles from "./charts.module.css";

type Metric = "events" | "pageViews" | "clicks";
type Tone = "blue" | "violet" | "teal" | "amber";
const metricNames: Record<Metric, string> = { events: "Events", pageViews: "Page views", clicks: "Clicks" };

export default function BreakdownChart({ title, rows, metric = "events", tone = "blue", formatLabel }: {
  title: string;
  rows: Breakdown[];
  metric?: Metric;
  tone?: Tone;
  formatLabel?: (label: string) => string;
}) {
  const captionId = useId();
  const ranked = rows.filter((row) => Number.isFinite(row[metric]) && row[metric] > 0)
    .toSorted((left, right) => right[metric] - left[metric] || left.label.localeCompare(right.label))
    .slice(0, 5);
  const maximum = ranked[0]?.[metric] || 1;
  return <figure className={styles.chart} data-tone={tone} aria-labelledby={captionId}>
    <figcaption id={captionId}><h3>{title}</h3><span>{metricNames[metric]} · top {ranked.length || 5} groups</span></figcaption>
    {!ranked.length ? <p className={styles.empty}>No matching {metricNames[metric].toLowerCase()} to chart.</p> :
      <ol className={styles.chartRows}>
        {ranked.map((row) => <li key={row.label}>
          <div className={styles.chartLabel}><span title={row.label}>{formatLabel?.(row.label) || row.label}{formatLabel && formatLabel(row.label) !== row.label && <span className={styles.srOnly}> ({row.label})</span>}</span><strong>{row[metric].toLocaleString("en-US")}</strong></div>
          <svg viewBox="0 0 100 6" preserveAspectRatio="none" aria-hidden="true" focusable="false">
            <rect width="100" height="6" rx="3" className={styles.chartTrack} />
            <rect width={row[metric] / maximum * 100} height="6" rx="3" className={styles.chartBar} />
          </svg>
        </li>)}
      </ol>}
    <p className={styles.chartNote}>Matching {metric === "events" ? "event" : metricNames[metric].toLowerCase()} counts from the report breakdown, independent of the journey display cap.</p>
  </figure>;
}
