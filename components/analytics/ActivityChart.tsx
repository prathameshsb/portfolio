import { useId } from "react";
import styles from "./charts.module.css";

export interface DailyActivity {
  date: string;
  pageViews: number;
  clicks: number;
  events: number;
}

function validDay(day: DailyActivity): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(day.date)
    && Number.isFinite(Date.parse(`${day.date}T00:00:00Z`))
    && new Date(`${day.date}T00:00:00Z`).toISOString().slice(0, 10) === day.date
    && [day.pageViews, day.clicks, day.events].every((value) => Number.isFinite(value) && value >= 0);
}

function dateLabel(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

export default function ActivityChart({ days }: { days?: DailyActivity[] }) {
  const titleId = useId();
  const areaId = useId();
  const available = !!days?.length && days.every(validDay) && new Set(days.map((day) => day.date)).size === days.length;
  const ordered = available ? days.toSorted((a, b) => a.date.localeCompare(b.date)) : [];
  const maximum = Math.max(0, ...ordered.flatMap((day) => [day.pageViews, day.clicks]));
  const totals = ordered.reduce((sum, day) => ({ pageViews: sum.pageViews + day.pageViews, clicks: sum.clicks + day.clicks }), { pageViews: 0, clicks: 0 });
  const x = (index: number) => ordered.length === 1 ? 377 : 44 + index / (ordered.length - 1) * 666;
  const y = (value: number) => 178 - value / (maximum || 1) * 140;
  const points = (metric: "pageViews" | "clicks") => ordered.map((day, index) => `${x(index)},${y(day[metric])}`).join(" ");
  const ticks = [...new Set([0, Math.floor((ordered.length - 1) / 2), ordered.length - 1])].filter((index) => index >= 0);

  return <figure className={`${styles.chart} ${styles.activity}`} aria-labelledby={titleId}>
    <figcaption id={titleId}><div><h3>Activity over time</h3><span>Daily page views and clicks · UTC</span></div><span className={styles.period}>{ordered.length ? `${ordered.length} ${ordered.length === 1 ? "day" : "days"}` : ""}</span></figcaption>
    {!available ? <p className={styles.empty}>Daily activity is unavailable for this report. The breakdowns below still show recorded totals.</p> : <>
      <div className={styles.seriesKey}><span><i className={styles.blueDot} aria-hidden="true" />Page views <strong>{totals.pageViews.toLocaleString("en-US")}</strong></span><span><i className={styles.tealDash} aria-hidden="true" />Clicks <strong>{totals.clicks.toLocaleString("en-US")}</strong></span></div>
      <div className={styles.plotFrame}>
      <svg className={styles.activityPlot} viewBox="0 0 738 218" role="img" aria-label={`Daily activity: ${totals.pageViews.toLocaleString("en-US")} page views and ${totals.clicks.toLocaleString("en-US")} clicks. Exact daily values follow in the data table.`}>
        <defs><linearGradient id={areaId} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#5264d9" stopOpacity=".18" /><stop offset="100%" stopColor="#5264d9" stopOpacity=".02" /></linearGradient></defs>
        {(maximum ? [maximum, maximum / 2, 0] : [0]).map((value) => <line key={value} x1="44" x2="710" y1={y(value)} y2={y(value)} className={styles.gridLine} />)}
        {ordered.length > 1 && <polygon points={`44,178 ${points("pageViews")} 710,178`} fill={`url(#${areaId})`} />}
        <polyline points={points("pageViews")} className={styles.viewLine} />
        <polyline points={points("clicks")} className={styles.clickLine} />
        {ordered.length === 1 && <><circle cx={x(0)} cy={y(ordered[0].pageViews)} r="4" fill="#5264d9" /><circle cx={x(0)} cy={y(ordered[0].clicks)} r="3" fill="#0f817b" /></>}
      </svg>
      <div className={styles.plotAxes} aria-hidden="true">
        {(maximum ? [maximum, maximum / 2, 0] : [0]).map((value) => <span key={value} className={styles.yTick} style={{ top: `${y(value) / 218 * 100}%` }}>{Number.isInteger(value) ? value.toLocaleString("en-US") : value.toFixed(1)}</span>)}
        {ticks.map((index) => <span key={index} className={styles.xTick} data-edge={ordered.length === 1 ? "middle" : index === 0 ? "start" : index === ordered.length - 1 ? "end" : "middle"} style={{ left: `${x(index) / 738 * 100}%` }}>{dateLabel(ordered[index].date)}</span>)}
      </div>
      </div>
      {maximum === 0 && <p className={styles.zeroNote}>No page views or clicks were recorded in this window.</p>}
      <details className={styles.dataDisclosure}><summary>View daily values</summary><div className={styles.tableWrap}><table><caption className={styles.srOnly}>Daily activity in UTC from all matching events</caption><thead><tr><th scope="col">Date (UTC)</th><th scope="col">Page views</th><th scope="col">Clicks</th><th scope="col">All events</th></tr></thead><tbody>{ordered.map((day) => <tr key={day.date}><th scope="row">{day.date}</th><td>{day.pageViews.toLocaleString("en-US")}</td><td>{day.clicks.toLocaleString("en-US")}</td><td>{day.events.toLocaleString("en-US")}</td></tr>)}</tbody></table></div></details>
      <p className={styles.chartNote}>All matching events, including days with zero activity. This chart does not use the limited journey sample.</p>
    </>}
  </figure>;
}
