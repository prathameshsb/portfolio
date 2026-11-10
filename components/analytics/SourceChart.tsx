import { useId } from "react";
import type { Breakdown } from "../../lib/analytics/queries";
import styles from "./charts.module.css";

const colors = ["#5264d9", "#7c4ac7", "#0f817b", "#b5631c", "#a1aabd"];

export default function SourceChart({ rows, totalEvents }: { rows: Breakdown[]; totalEvents: number }) {
  const titleId = useId();
  const groups = new Map<string, number>();
  const valid = Number.isFinite(totalEvents) && totalEvents >= 0 && rows.every((row) => Number.isFinite(row.events) && row.events >= 0);
  if (valid) for (const row of rows) groups.set(row.label, (groups.get(row.label) || 0) + row.events);
  const ranked = [...groups].filter(([, value]) => value > 0).toSorted((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const consistent = valid && ranked.reduce((sum, [, value]) => sum + value, 0) <= totalEvents;
  const segments = consistent ? ranked.slice(0, 4).map(([label, value]) => ({ label, value })) : [];
  const other = totalEvents - segments.reduce((sum, segment) => sum + segment.value, 0);
  if (consistent && other > 0) segments.push({ label: "Other sources", value: other });
  const circumference = 2 * Math.PI * 68;
  const offsets = segments.map((_, index) => segments.slice(0, index).reduce((sum, previous) => sum + previous.value, 0));

  return <figure className={`${styles.chart} ${styles.source}`} aria-labelledby={titleId}>
    <figcaption id={titleId}><h3>Where activity comes from</h3><span>Share of matching events by source</span></figcaption>
    {!consistent ? <p className={styles.empty}>Source counts could not be reconciled with this report. Refresh the report to try again.</p> : totalEvents === 0 ? <p className={styles.empty}>No matching events to chart.</p> : <>
      <div className={styles.donutWrap}>
        <svg viewBox="0 0 176 176" className={styles.donut} aria-hidden="true" focusable="false">
          <circle cx="88" cy="88" r="68" fill="none" stroke="#eef0f6" strokeWidth="17" />
          {segments.map((segment, index) => <circle key={`${segment.label}-${index}`} cx="88" cy="88" r="68" fill="none" stroke={colors[index]} strokeWidth="17" strokeDasharray={`${segment.value / totalEvents * circumference} ${circumference}`} strokeDashoffset={-offsets[index] / totalEvents * circumference} transform="rotate(-90 88 88)" />)}
        </svg>
        <div className={styles.donutValue}><strong>{totalEvents.toLocaleString("en-US")}</strong><span>events</span></div>
      </div>
      <ul className={styles.sourceLegend}>{segments.map((segment, index) => <li key={`${segment.label}-${index}`}><span className={styles.sourceName}><i style={{ backgroundColor: colors[index] }} aria-hidden="true" />{segment.label}</span><strong>{segment.value.toLocaleString("en-US")}</strong><span>{(segment.value / totalEvents * 100).toFixed(1)}%</span></li>)}</ul>
      <p className={styles.chartNote}>Events, not unique people. Other sources includes groups outside the displayed ranking.</p>
    </>}
  </figure>;
}
