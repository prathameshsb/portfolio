"use client";
import Link from "next/link";

import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";
import type { AnalyticsReport, Breakdown, SessionJourney } from "../../lib/analytics/queries";
import { ENVIRONMENTS, PROJECT_IDS } from "../../lib/analytics/schema";
import styles from "./Dashboard.module.css";
import BreakdownChart from "./BreakdownChart";
import ActivityChart from "./ActivityChart";
import SourceChart from "./SourceChart";

type Filters = {
  from: string;
  to: string;
  environment: "production" | "preview" | "development";
  traffic: "visitor" | "test" | "owner" | "all";
  source: string;
  campaign: string;
  project: string;
};
type LoadState = "loading" | "ready" | "error" | "expired";

function initialFilters(): Filters {
  const today = new Date();
  const from = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - 29));
  return {
    from: from.toISOString().slice(0, 10), to: today.toISOString().slice(0, 10),
    environment: "production", traffic: "visitor", source: "", campaign: "", project: "",
  };
}

export function dashboardFilterQuery(filters: Filters): string {
  const from = new Date(`${filters.from}T00:00:00.000Z`);
  const to = new Date(`${filters.to}T00:00:00.000Z`);
  to.setUTCDate(to.getUTCDate() + 1);
  const duration = to.getTime() - from.getTime();
  if (!Number.isFinite(duration) || duration <= 0 || duration > 366 * 86_400_000) {
    throw new Error("Choose a valid date range up to 366 days.");
  }
  const query = new URLSearchParams({
    from: from.toISOString(), to: to.toISOString(), environment: filters.environment, traffic: filters.traffic,
  });
  for (const key of ["source", "campaign", "project"] as const) {
    const value = filters[key].trim();
    if (value) query.set(key, value);
  }
  return query.toString();
}

function activeTime(milliseconds: number): string {
  const seconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(seconds / 60);
  return minutes ? `${minutes.toLocaleString("en-US")}m ${seconds % 60}s` : `${seconds}s`;
}

function utc(value: string | null): string {
  return value ? `${new Date(value).toISOString().replace("T", " ").slice(0, 19)} UTC` : "No received events";
}

function displayLabel(raw: string): string {
  const names: Record<string, string> = {
    "/": "Home", "/about": "About", "findem-query-insights-hub": "Query Insights Hub",
    "findem-checkout-flow": "Fulfillment workflow", "findem-password-validator": "Password Validator",
    "gryphon-sales-analytics": "Gryphon Sales Analytics", "nexa": "Nexa", "nexa-design-system": "Nexa Design System",
    "incluvie": "Incluvie", "flexrent": "Flexrent", "snapkart": "Snapkart", "non-project pages": "Other pages",
    "portfolio": "Portfolio home", "interaction-motion": "Interaction & Motion (work listing)",
    "nav.about": "About navigation", "nav.home": "Home navigation", "nav.resume": "Resume navigation",
  };
  return names[raw] || names[raw.replace(/^\/projects\//, "")] || raw;
}

const count = z.number().finite().nonnegative();
const timestamp = z.iso.datetime({ offset: true });
const breakdown = z.object({
  label: z.string(), events: count, sessions: count, pageViews: count,
  clicks: count, activeMs: count, maxScroll: count,
});
const reportSchema = z.object({
  filters: z.object({
    from: timestamp, to: timestamp, environment: z.enum(ENVIRONMENTS),
    traffic: z.enum(["visitor", "owner", "test", "all"]),
    source: z.string().optional(), campaign: z.string().optional(), project: z.string().optional(),
  }),
  summary: z.object({
    events: count, sessions: count, pageViews: count, clicks: count,
    activeMs: count, legacyActiveMs: count, attributedSessions: count, freshness: timestamp.nullable(),
  }),
  dailyActivity: z.array(z.object({ date: z.iso.date(), pageViews: count, clicks: count, events: count })).optional(),
  sources: z.array(breakdown), campaigns: z.array(breakdown),
  projects: z.array(breakdown), pages: z.array(breakdown), targets: z.array(breakdown),
  sessions: z.array(z.object({
    origin: z.string(), sessionId: z.string(), firstSeen: timestamp, lastSeen: timestamp,
    source: z.string().nullable(), campaign: z.string().nullable(), recipientToken: z.string().nullable(),
    attribution: z.enum(["recipient-link", "anonymous"]), traffic: z.string(), activeMs: count, legacyActiveMs: count,
    eventsTruncated: z.boolean(), events: z.array(z.object({
      eventId: z.string(), type: z.string(), occurredAt: timestamp, route: z.string(),
      projectId: z.string().nullable(), targetId: z.string().nullable(),
      activeMs: count.nullable(), scrollDepth: count.nullable(),
    })),
  })),
  sessionsTruncated: z.boolean(), generatedAt: timestamp,
  definitions: z.record(z.string(), z.string()),
  sourceMetadata: z.object({
    backend: z.literal("google-sheets"), fetchedAt: timestamp, sourceFreshness: timestamp.nullable(),
    totalRows: count, heldRows: count, duplicateRows: count, warnings: z.array(z.string()),
  }).optional(),
});

function BreakdownTable({ title, rows, intervalAvailable }: { title: string; rows: Breakdown[]; intervalAvailable: boolean }) {
  return <details className={styles.panel} aria-label={title}>
    <summary><span>{title}</span><span>{rows.length} groups</span></summary>
    {!rows.length ? <p className={styles.muted}>No matching activity in this breakdown.</p> :
      <div className={styles.tableWrap}><table>
        <thead><tr><th scope="col">Target</th><th scope="col">Events</th><th scope="col">Sessions</th><th scope="col">Clicks</th>{intervalAvailable && <th scope="col">Active time (interval deltas)</th>}<th scope="col">Max scroll</th></tr></thead>
        <tbody>{rows.map((row) => <tr key={row.label}>
          <th scope="row">{row.label}</th><td>{row.events.toLocaleString("en-US")}</td>
          <td>{row.sessions.toLocaleString("en-US")}</td><td>{row.clicks.toLocaleString("en-US")}</td>
          {intervalAvailable && <td>{activeTime(row.activeMs)}</td>}<td>{row.maxScroll}%</td>
        </tr>)}</tbody>
      </table></div>}
  </details>;
}

const resumeCampaigns: Record<string, string> = {
  "product-design-san-jose": "Product Design · San Jose",
  "product-design-new-york": "Product Design · New York",
  "design-engineering-san-jose": "Design Engineering · San Jose",
  "design-engineering-new-york": "Design Engineering · New York",
};

function sessionTitle(session: SessionJourney): string {
  if (session.source === "resume") return `Resume visit · ${resumeCampaigns[session.campaign || ""] || session.campaign || "Unspecified version"}`;
  if (session.attribution === "recipient-link") return `Recipient-link session · ${session.sessionId.slice(0, 8)}`;
  if (session.source) return `${session.source} visit · ${session.sessionId.slice(0, 8)}`;
  return `Direct / untagged visit · ${session.sessionId.slice(0, 8)}`;
}

function resumeEntryLabel(session: SessionJourney): string {
  const target = session.events.find(event => event.type === "page_view" && event.targetId?.startsWith("resume.entry."))?.targetId;
  return target ? displayLabel(target.slice("resume.entry.".length)) : displayLabel(session.events.find(event => event.type === "page_view")?.route || session.events[0]?.route || "/");
}

function SessionDetails({ session, intervalAvailable }: { session: SessionJourney; intervalAvailable: boolean }) {
  const [open, setOpen] = useState(false);
  return <details className={styles.session} onToggle={(event) => setOpen(event.currentTarget.open)}>
    <summary><span>{sessionTitle(session)}</span>
      <span className={styles.sessionOverview}>{session.source === "resume" ? resumeEntryLabel(session) : session.source || "direct / untagged"}<span>{session.events.length}{session.eventsTruncated ? "+" : ""} events · {activeTime(intervalAvailable ? session.activeMs : session.legacyActiveMs)} {intervalAvailable ? "interval" : "tracked max"}</span></span>
      <span className={styles.muted}>{utc(session.firstSeen)}</span>
    </summary>
    {open && <div className={styles.sessionBody}>
      <dl className={styles.sessionMetadata}>
        {session.source === "resume" && <div><dt>Resume entry link</dt><dd>{resumeEntryLabel(session)}</dd></div>}
        {session.source === "resume" && <div><dt>Resume version</dt><dd>{resumeCampaigns[session.campaign || ""] || session.campaign || "Unspecified version"} — identifies the resume link used, not the person who opened it.</dd></div>}
        <div><dt>Session ID</dt><dd>{session.sessionId}</dd></div>
        <div><dt>Origin</dt><dd>{session.origin}</dd></div>
        <div><dt>Source / campaign</dt><dd>{session.source || "direct / untagged"} / {session.campaign || "untagged"}</dd></div>
        <div><dt>Traffic</dt><dd>{session.traffic}</dd></div>
        {intervalAvailable && <div><dt>Active time (interval deltas)</dt><dd>{activeTime(session.activeMs)}</dd></div>}
        {(!intervalAvailable || session.legacyActiveMs > 0) && <div><dt>Tracked active time (session maximum)</dt><dd>{activeTime(session.legacyActiveMs)} — the filtered maximum may include earlier session activity.</dd></div>}
        {session.recipientToken && <div><dt>Recipient link token</dt><dd>{session.recipientToken} — identifies the issued link, not the person who opened it.</dd></div>}
      </dl>
      {session.eventsTruncated && <p className={styles.notice}>Partial journey: only the first 500 matching events are shown.</p>}
      <div className={styles.tableWrap}><table>
        <thead><tr><th scope="col">Time (UTC)</th><th scope="col">Event</th><th scope="col">Page / target</th><th scope="col">Engagement</th></tr></thead>
        <tbody>{session.events.map((event) => <tr key={event.eventId}>
          <td>{utc(event.occurredAt)}</td><td>{event.type}</td><td>{event.route}{event.targetId && <><br /><span className={styles.muted}>{event.targetId}</span></>}</td>
          <td>{intervalAvailable && event.activeMs !== null ? activeTime(event.activeMs) : event.scrollDepth !== null ? `${event.scrollDepth}% scroll` : "—"}</td>
        </tr>)}</tbody>
      </table></div>
    </div>}
  </details>;
}

export default function Dashboard() {
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [report, setReport] = useState<AnalyticsReport | null>(null);
  const [state, setState] = useState<LoadState>("loading");
  const [error, setError] = useState("");
  const [exportState, setExportState] = useState<"idle" | "loading">("idle");
  const [exportMessage, setExportMessage] = useState("");
  const [formError, setFormError] = useState("");
  const [logoutMessage, setLogoutMessage] = useState("");
  const [showAllSessions, setShowAllSessions] = useState(false);
  const activeRequest = useRef<AbortController | null>(null);
  const reportQuery = useRef("");

  const load = useCallback(async (query: string) => {
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    let timedOut = false;
    const timeout = window.setTimeout(() => { timedOut = true; controller.abort(); }, 15_000);
    try {
      const response = await fetch(`/api/owner/report?${query}`, {
        signal: controller.signal, cache: "no-store", credentials: "same-origin",
        headers: { "X-Requested-With": "XMLHttpRequest", Accept: "application/json" },
      });
      if (controller.signal.aborted) {
        if (timedOut) throw new Error("Analytics timed out. Your filters are preserved; retry shortly.");
        return;
      }
      if (response.status === 401 || response.status === 403 || response.redirected) {
        setState("expired"); return;
      }
      if (!response.ok) throw new Error("Analytics is unavailable. Your filters are preserved; retry shortly.");
      const body: unknown = await response.json();
      if (controller.signal.aborted) return;
      const parsed = reportSchema.safeParse(body);
      if (!parsed.success) throw new Error("The analytics response could not be read. Retry shortly.");
      reportQuery.current = query;
      setReport(parsed.data); setState("ready");
    } catch (failure) {
      if (controller.signal.aborted && !timedOut) return;
      setError(timedOut ? "Analytics timed out. Your filters are preserved; retry shortly." : failure instanceof Error ? failure.message : "Analytics is unavailable. Retry shortly.");
      setState("error");
    } finally {
      window.clearTimeout(timeout);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Initial state is loading; load updates state only after the asynchronous response.
    void load(dashboardFilterQuery(initialFilters()));
    return () => activeRequest.current?.abort();
  }, [load]);

  function requestReport(query: string) {
    setState("loading"); setReport(null); setError(""); setExportMessage(""); setShowAllSessions(false);
    void load(query);
  }

  function applyFilters(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const query = dashboardFilterQuery(filters);
      setFormError("");
      requestReport(query);
    } catch (failure) {
      setFormError(failure instanceof Error ? failure.message : "Choose valid filters.");
    }
  }

  function updateFilter<Key extends keyof Filters>(key: Key, value: Filters[Key]) {
    setFilters((previous) => ({ ...previous, [key]: value }));
  }

  async function exportEvents() {
    if (!report || !reportQuery.current) return;
    setExportState("loading"); setExportMessage("");
    try {
      const response = await fetch(`/api/owner/export?${reportQuery.current}`, {
        cache: "no-store", credentials: "same-origin", signal: AbortSignal.timeout(15_000),
        headers: { "X-Requested-With": "XMLHttpRequest", Accept: "application/json" },
      });
      if (response.status === 401 || response.status === 403 || response.redirected) {
        setReport(null); setState("expired"); return;
      }
      if (!response.ok) throw new Error("Export is unavailable. Retry shortly.");
      const body: unknown = await response.json();
      if (!body || typeof body !== "object" || !("events" in body) || !Array.isArray(body.events)) {
        throw new Error("The export response could not be read. Retry shortly.");
      }
      const blob = new Blob([JSON.stringify(body, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url; link.download = `portfolio-events-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.append(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setExportMessage("truncated" in body && body.truncated
        ? "Partial export downloaded: first 10,000 matching events. Narrow the date range for the remaining events."
        : `Export downloaded: ${body.events.length.toLocaleString("en-US")} matching events.`);
    } catch (failure) {
      setExportMessage(failure instanceof Error ? failure.message : "Export is unavailable. Retry shortly.");
    } finally {
      setExportState("idle");
    }
  }

  async function signOut() {
    setLogoutMessage("");
    try {
      const csrfResponse = await fetch("/api/owner/login", { cache: "no-store", credentials: "same-origin", signal: AbortSignal.timeout(15_000) });
      const data: unknown = await csrfResponse.json();
      if (!csrfResponse.ok || !data || typeof data !== "object" || !("csrfToken" in data) || typeof data.csrfToken !== "string") throw new Error("Sign out is unavailable. Retry shortly.");
      const response = await fetch("/api/owner/logout", {
        method: "POST", cache: "no-store", credentials: "same-origin", signal: AbortSignal.timeout(15_000),
        headers: { "x-owner-csrf": data.csrfToken },
      });
      if (!response.ok) throw new Error("Sign out is unavailable. Retry shortly.");
      setReport(null); window.location.reload();
    } catch { setLogoutMessage("Sign out is unavailable. Retry shortly."); }
  }

  const hasNarrowingFilter = !!(report?.filters.source || report?.filters.campaign || report?.filters.project);
  const intervalAvailable = report?.sourceMetadata?.backend !== "google-sheets";
  const warnings = [...new Set([...(report?.sourceMetadata?.warnings || []), ...(report?.definitions.partialData ? [report.definitions.partialData] : [])])];
  const needsAttention = warnings.length > 0 || (report?.sourceMetadata?.heldRows || 0) > 0;
  const shownSessions = showAllSessions ? report?.sessions : report?.sessions.slice(0, 6);
  function selectWindow(days: number) {
    const today = new Date();
    const through = today.toISOString().slice(0, 10);
    const from = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - days + 1)).toISOString().slice(0, 10);
    const next = { ...filters, from, to: through };
    setFilters(next); setFormError(""); requestReport(dashboardFilterQuery(next));
  }
  return <section className={styles.dashboard} aria-label="Portfolio analytics workspace">
    <aside className={styles.sidebar} aria-label="Dashboard navigation">
      <a className={styles.brand} href="#overview"><span>PS</span><div>Portfolio<span>Owner workspace</span></div></a>
      <p className={styles.navLabel}>YOUR WORKSPACE</p>
      <nav><a href="#overview" className={styles.navActive}><span aria-hidden="true">◫</span> Overview</a><a href="#breakdowns"><span aria-hidden="true">▤</span> Breakdowns</a><a href="#journeys"><span aria-hidden="true">⌁</span> Session journeys</a><a href="#data-health"><span aria-hidden="true">◎</span> Data status</a></nav>
      <div className={styles.sidebarBottom}><p>A little perspective on<br />how your work is seen.</p><Link href="/">View portfolio <span aria-hidden="true">↗</span></Link></div>
    </aside>
    <div className={styles.workspace}>
    <header className={styles.header} id="overview">
      <div><p className={styles.eyebrow}>YOUR PORTFOLIO / OVERVIEW</p><h1>Portfolio analytics</h1><p>A clearer picture of how visitors explore your work.</p></div>
      <button className={styles.logout} onClick={() => void signOut()}>Sign out <span aria-hidden="true">↗</span></button>
    </header>
    {logoutMessage && <p className={styles.notice} role="alert">{logoutMessage}</p>}
    <form className={styles.filters} onSubmit={applyFilters} aria-label="Analytics filters">
      <div className={styles.filterHeading}><strong>Report window</strong><div className={styles.presets} aria-label="Quick date ranges">{[7, 30, 90].map(days => <button key={days} type="button" disabled={state === "loading"} onClick={() => selectWindow(days)}>Last {days} days</button>)}</div></div>
      <div className={styles.filterRow}>
        <label>From (UTC)<input type="date" required value={filters.from} onChange={(event) => updateFilter("from", event.target.value)} /></label>
        <label>Through (UTC, inclusive)<input type="date" required value={filters.to} onChange={(event) => updateFilter("to", event.target.value)} /></label>
        <label>Traffic<select aria-label="Traffic" value={filters.traffic} onChange={(event) => updateFilter("traffic", event.target.value as Filters["traffic"])}><option value="visitor">Visitors — excludes owner/test</option><option value="owner">Owner only</option><option value="test">Test only</option><option value="all">All traffic — includes owner/test</option></select></label>
        <button className={styles.primary} type="submit" disabled={state === "loading"}>Apply filters</button>
      </div>
      <details className={styles.advancedFilters}><summary>More filters <span>Source, campaign, project & environment</span></summary><div className={styles.filterRow}>
        <label>Source<input value={filters.source} maxLength={80} pattern="[a-zA-Z0-9._~-]+" list="analytics-sources" placeholder="All sources" onChange={(event) => updateFilter("source", event.target.value)} /></label>
        <label>Campaign<input value={filters.campaign} maxLength={80} pattern="[a-zA-Z0-9._~-]+" list="analytics-campaigns" placeholder="All campaigns" onChange={(event) => updateFilter("campaign", event.target.value)} /></label>
        <label className={styles.projectFilter}>Project<select aria-label="Project" value={filters.project} onChange={(event) => updateFilter("project", event.target.value)}><option value="">All projects and pages</option>{PROJECT_IDS.map((value) => <option key={value} value={value}>{value.replaceAll("-", " ")}</option>)}</select></label>
        <label>Environment<select aria-label="Environment" value={filters.environment} onChange={(event) => updateFilter("environment", event.target.value as Filters["environment"])}>{ENVIRONMENTS.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
      </div></details>
      <datalist id="analytics-sources">{report?.sources.filter((row) => /^[a-zA-Z0-9._~-]+$/.test(row.label)).map((row) => <option key={row.label} value={row.label} />)}</datalist>
      <datalist id="analytics-campaigns">{report?.campaigns.filter((row) => row.label !== "untagged" && /^[a-zA-Z0-9._~-]+$/.test(row.label)).map((row) => <option key={row.label} value={row.label} />)}</datalist>
      {formError && <p className={styles.formError} role="alert">{formError}</p>}
    </form>
    {state === "loading" && <section className={styles.message} role="status" aria-live="polite"><div className={styles.loadingMarks} aria-hidden="true"><i /><i /><i /></div><h2>Loading analytics…</h2><p>Reading matching persisted events.</p></section>}
    {state === "expired" && <section className={styles.message} role="alert"><h2>Access expired or denied</h2><p>Sign in again to view analytics. No analytics is displayed.</p><button onClick={() => window.location.reload()}>Sign in again</button></section>}
    {state === "error" && <section className={styles.message} role="alert"><h2>Analytics unavailable</h2><p>{error}</p><button onClick={() => { try { requestReport(dashboardFilterQuery(filters)); } catch { setFormError("Choose valid dates before retrying."); } }}>Retry</button></section>}
    {state === "ready" && report && <>
      <section className={styles.reportHeader} aria-label="Report details">
        <div><p><strong>{report.filters.from.slice(0, 10)} — {new Date(Date.parse(report.filters.to) - 1).toISOString().slice(0, 10)}</strong><span className={styles.cohort}>{report.filters.traffic === "visitor" ? "Visitor traffic" : `${report.filters.traffic} traffic`}</span></p><p className={styles.muted}>Applied filters · {report.filters.environment}{report.filters.source ? ` · ${report.filters.source}` : ""}{report.filters.campaign ? ` · ${report.filters.campaign}` : ""}{report.filters.project ? ` · ${report.filters.project}` : ""} · UTC</p></div>
        <button onClick={() => void exportEvents()} disabled={exportState === "loading"}>{exportState === "loading" ? "Preparing export…" : "Export matching events"} <span aria-hidden="true">↓</span></button>
      </section>
      {exportMessage && <p className={styles.notice} role="status">{exportMessage}</p>}
      <dl className={styles.metrics} aria-label="Portfolio overview">
        {[
          { label: "Sessions", value: report.summary.sessions.toLocaleString("en-US"), note: "Visits, not unique people", icon: "◉", tone: "blue" },
          { label: "Page views", value: report.summary.pageViews.toLocaleString("en-US"), note: "Pages opened across visits", icon: "▤", tone: "violet" },
          { label: "Clicks", value: report.summary.clicks.toLocaleString("en-US"), note: "Recorded link & button clicks", icon: "↗", tone: "teal" },
          { label: intervalAvailable ? "Active time" : "Tracked time", value: activeTime(intervalAvailable ? report.summary.activeMs : report.summary.legacyActiveMs), note: intervalAvailable ? "Focused, recently active time" : "Tracked time, not proof of attention", icon: "◷", tone: "amber" },
        ].map(metric => <div key={metric.label} data-tone={metric.tone}><span className={styles.metricIcon} aria-hidden="true">{metric.icon}</span><dt>{metric.label}</dt><dd>{metric.value}</dd><p>{metric.note}</p></div>)}
      </dl>
      {needsAttention && <a className={styles.attentionBanner} href="#data-health"><span aria-hidden="true">!</span><div><strong>Some data needs a closer look</strong><p>Source warnings or held rows may affect this report. Review data status below.</p></div><span aria-hidden="true">↘</span></a>}
      {report.summary.events === 0 ? <section className={styles.message} role="status"><span className={styles.emptyIcon} aria-hidden="true">◌</span>
        <h2>{hasNarrowingFilter ? "No matching results" : "No traffic in this window"}</h2>
        <p>{hasNarrowingFilter ? "Clear a source, campaign or project filter, or choose another UTC date range." : "No persisted events match this environment, traffic cohort and UTC date range."}</p>
      </section> : <>
        <section className={styles.visuals} aria-label="Activity comparisons">
          <div className={styles.sectionHeading}><div><p className={styles.eyebrow}>THE BIG PICTURE</p><h2>How your portfolio is being explored</h2></div><p className={styles.muted}>Your selected window, brought into focus.</p></div>
          <div className={styles.overviewCharts}><ActivityChart days={report.dailyActivity} /><SourceChart rows={report.sources} totalEvents={report.summary.events} /></div>
          <div className={styles.chartGrid}>
            <BreakdownChart title="Top pages" rows={report.pages} metric="pageViews" tone="blue" formatLabel={displayLabel} />
            <BreakdownChart title="Top projects" rows={report.projects} tone="violet" formatLabel={displayLabel} />
            <BreakdownChart title="Top click targets" rows={report.targets} metric="clicks" tone="teal" formatLabel={displayLabel} />
          </div>
          <p className={styles.chartContext}>Page rankings show page views; project bars show event counts, not unique people. Click targets show recorded clicks.</p>
        </section>
        <section id="breakdowns" aria-label="Detailed breakdowns" className={styles.detailSection}>
          <div className={styles.sectionHeading}><div><p className={styles.eyebrow}>LOOK A LITTLE CLOSER</p><h2>Detailed breakdowns</h2></div><p className={styles.muted}>The numbers behind the graphs.</p></div>
          <p className={styles.muted}>Each breakdown displays up to 100 groups. Sessions can appear in multiple groups; do not add group counts to infer unique people.</p>
          <div className={styles.breakdownTabs} role="group" aria-label="Breakdown categories">
            <BreakdownTable title="Pages" rows={report.pages} intervalAvailable={intervalAvailable} />
            <BreakdownTable title="Projects" rows={report.projects} intervalAvailable={intervalAvailable} />
            <BreakdownTable title="Sources" rows={report.sources} intervalAvailable={intervalAvailable} />
            <BreakdownTable title="Campaigns" rows={report.campaigns} intervalAvailable={intervalAvailable} />
            <BreakdownTable title="Click and navigation targets" rows={report.targets} intervalAvailable={intervalAvailable} />
          </div>
        </section>
      </>}
      <section className={styles.health} id="data-health" aria-label="Tracker source status">
        <div className={styles.sectionHeading}><div><p className={styles.eyebrow}>KNOW WHAT YOU’RE LOOKING AT</p><h2>Data status</h2></div><span className={needsAttention ? styles.warningBadge : styles.statusBadge}>{needsAttention ? "Review recommended" : "Report loaded"}</span></div>
        <div className={styles.healthGrid}>
          <div><span className={styles.statusDot} aria-hidden="true" /><strong>Existing Google tracker</strong><p className={styles.muted}>Fetched {utc(report.sourceMetadata?.fetchedAt || report.generatedAt)}</p><p className={styles.muted}>Last matching ingestion: {utc(report.summary.freshness)}</p><p className={styles.muted}>A successful read confirms this report loaded. It does not verify that every visit was captured or that the website is error-free.</p></div>
          <dl className={styles.qualityMetrics}><div><dt>Source rows</dt><dd>{report.sourceMetadata ? report.sourceMetadata.totalRows.toLocaleString("en-US") : "Unavailable"}</dd></div><div><dt>Held for review</dt><dd>{report.sourceMetadata ? report.sourceMetadata.heldRows.toLocaleString("en-US") : "Unavailable"}</dd></div><div><dt>Duplicates excluded</dt><dd>{report.sourceMetadata ? report.sourceMetadata.duplicateRows.toLocaleString("en-US") : "Unavailable"}</dd></div></dl>
        </div>
        {warnings.map(warning => <p className={styles.notice} key={warning}>{warning}</p>)}
        {!warnings.length && <p className={styles.coverageNote}>No source warnings were returned. Consent, blockers and offline visits can still leave gaps.</p>}
        {(!intervalAvailable || report.summary.legacyActiveMs > 0) && <details className={styles.coverage} aria-label="Tracked active time coverage"><summary>How to read tracked time</summary><p>Historical visible-tab timing can include idle time; newer tracking requires focus and recent input. This sums the largest tracked value in each matching session. A filtered session maximum may include earlier session activity. These values do not prove attention.</p>{!intervalAvailable && <p>Interval active-time deltas are unavailable for this tracker source, so they are omitted from summaries, breakdowns and journeys.</p>}</details>}
      </section>
      {report.summary.events > 0 && <section className={styles.journeys} id="journeys" aria-label="Session journeys"><div className={styles.sectionHeading}><div><p className={styles.eyebrow}>OPTIONAL DEEP DIVE</p><h2>Session journeys</h2></div><span className={styles.smallBadge}>{report.sessions.length}{report.sessionsTruncated ? "+" : ""} in this view</span></div><p className={styles.muted}>Open a session to follow its matching events. Resume tags identify the document version, not the reader’s identity or location. Other coded links establish link usage, not visitor identity.</p>
        {(report.sessionsTruncated || report.sessions.some(session => session.eventsTruncated)) && <p className={styles.notice}>Partial journeys: the view is limited to 100 sessions and 500 matching events per session. Summary totals include all matching events.</p>}
        {!report.sessions.length ? <p className={styles.coverageNote}>No session journeys are available for these recorded events.</p> : <div className={styles.sessionGrid}>{shownSessions?.map(session => <SessionDetails key={`${session.origin}:${session.sessionId}`} session={session} intervalAvailable={intervalAvailable} />)}</div>}
        {report.sessions.length > 6 && <button className={styles.showMore} onClick={() => setShowAllSessions(value => !value)}>{showAllSessions ? "Show fewer sessions" : `Show all ${report.sessions.length} sessions`}</button>}
      </section>}
      <details className={styles.definitions} aria-label="Metric definitions"><summary>Definitions and coverage</summary><dl><div><dt>Recipient-link sessions</dt><dd>{report.summary.attributedSessions.toLocaleString("en-US")} — identifies coded link usage, not a verified person.</dd></div>{Object.entries(report.definitions).map(([term, definition]) => <div key={term}><dt>{term}</dt><dd>{definition}</dd></div>)}</dl><p>Anonymous sessions are not verified people. Consent, blockers, offline failures and retention can leave gaps. Legacy imported active time may include idle visible-tab time.</p></details>
      <footer className={styles.footer}>Made for a little more clarity.<span>Portfolio owner workspace · All times UTC</span></footer>
    </>}
    </div>
  </section>;
}
