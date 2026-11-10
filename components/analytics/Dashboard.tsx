"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";
import type { AnalyticsReport, Breakdown, SessionJourney } from "../../lib/analytics/queries";
import { ENVIRONMENTS, PROJECT_IDS } from "../../lib/analytics/schema";
import styles from "./Dashboard.module.css";
import BreakdownChart from "./BreakdownChart";

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
  return <section className={styles.panel} aria-label={title}>
    <h2>{title}</h2>
    {!rows.length ? <p className={styles.muted}>No matching activity in this breakdown.</p> :
      <div className={styles.tableWrap}><table>
        <thead><tr><th scope="col">Target</th><th scope="col">Events</th><th scope="col">Sessions</th><th scope="col">Clicks</th>{intervalAvailable && <th scope="col">Active time (interval deltas)</th>}<th scope="col">Max scroll</th></tr></thead>
        <tbody>{rows.map((row) => <tr key={row.label}>
          <th scope="row">{row.label}</th><td>{row.events.toLocaleString("en-US")}</td>
          <td>{row.sessions.toLocaleString("en-US")}</td><td>{row.clicks.toLocaleString("en-US")}</td>
          {intervalAvailable && <td>{activeTime(row.activeMs)}</td>}<td>{row.maxScroll}%</td>
        </tr>)}</tbody>
      </table></div>}
  </section>;
}

function SessionDetails({ session, intervalAvailable }: { session: SessionJourney; intervalAvailable: boolean }) {
  const [open, setOpen] = useState(false);
  return <details className={styles.session} onToggle={(event) => setOpen(event.currentTarget.open)}>
    <summary><span>{session.attribution === "recipient-link" ? "Recipient-link session" : "Anonymous session"} · {session.sessionId.slice(0, 8)}</span>
      <span className={styles.sessionOverview}>{session.source || "direct / untagged"}<span>{session.events.length}{session.eventsTruncated ? "+" : ""} events · {activeTime(intervalAvailable ? session.activeMs : session.legacyActiveMs)} {intervalAvailable ? "interval" : "tracked max"}</span></span>
      <span className={styles.muted}>{utc(session.firstSeen)}</span>
    </summary>
    {open && <div className={styles.sessionBody}>
      <dl className={styles.sessionMetadata}>
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
    setState("loading"); setReport(null); setError(""); setExportMessage("");
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
  return <section className={styles.dashboard} aria-label="Portfolio analytics workspace">
    <header className={styles.header}>
      <div><p className={styles.eyebrow}>Private workspace</p><h1>Portfolio analytics</h1><p>Anonymous visits, click journeys and active engagement.</p></div>
      <button className={styles.logout} onClick={() => void signOut()}>Sign out</button>
    </header>
    {logoutMessage && <p className={styles.notice} role="alert">{logoutMessage}</p>}
    <form className={styles.filters} onSubmit={applyFilters} aria-label="Analytics filters">
      <label>From (UTC)<input type="date" required value={filters.from} onChange={(event) => updateFilter("from", event.target.value)} /></label>
      <label>Through (UTC, inclusive)<input type="date" required value={filters.to} onChange={(event) => updateFilter("to", event.target.value)} /></label>
      <label>Environment<select value={filters.environment} onChange={(event) => updateFilter("environment", event.target.value as Filters["environment"])}>{ENVIRONMENTS.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
      <label>Traffic<select value={filters.traffic} onChange={(event) => updateFilter("traffic", event.target.value as Filters["traffic"])}><option value="visitor">Visitors — excludes owner/test</option><option value="owner">Owner only</option><option value="test">Test only</option><option value="all">All traffic — includes owner/test</option></select></label>
      <label>Source<input value={filters.source} maxLength={80} pattern="[a-zA-Z0-9._~-]+" list="analytics-sources" placeholder="All sources" onChange={(event) => updateFilter("source", event.target.value)} /></label>
      <label>Campaign<input value={filters.campaign} maxLength={80} pattern="[a-zA-Z0-9._~-]+" list="analytics-campaigns" placeholder="All campaigns" onChange={(event) => updateFilter("campaign", event.target.value)} /></label>
      <label className={styles.projectFilter}>Project<select value={filters.project} onChange={(event) => updateFilter("project", event.target.value)}><option value="">All projects and pages</option>{PROJECT_IDS.map((value) => <option key={value} value={value}>{value.replaceAll("-", " ")}</option>)}</select></label>
      <button className={styles.primary} type="submit" disabled={state === "loading"}>Apply filters</button>
      <datalist id="analytics-sources">{report?.sources.filter((row) => /^[a-zA-Z0-9._~-]+$/.test(row.label)).map((row) => <option key={row.label} value={row.label} />)}</datalist>
      <datalist id="analytics-campaigns">{report?.campaigns.filter((row) => row.label !== "untagged" && /^[a-zA-Z0-9._~-]+$/.test(row.label)).map((row) => <option key={row.label} value={row.label} />)}</datalist>
      {formError && <p className={styles.formError} role="alert">{formError}</p>}
    </form>
    {state === "loading" && <section className={styles.message} role="status" aria-live="polite"><h2>Loading analytics…</h2><p>Reading matching persisted events.</p></section>}
    {state === "expired" && <section className={styles.message} role="alert"><h2>Access expired or denied</h2><p>Sign in again to view analytics. No analytics is displayed.</p><button onClick={() => window.location.reload()}>Sign in again</button></section>}
    {state === "error" && <section className={styles.message} role="alert"><h2>Analytics unavailable</h2><p>{error}</p><button onClick={() => { try { requestReport(dashboardFilterQuery(filters)); } catch { setFormError("Choose valid dates before retrying."); } }}>Retry</button></section>}
    {state === "ready" && report && <>
      <section className={styles.reportHeader} aria-label="Report details">
        <div><p>Applied window: {utc(report.filters.from)} → {utc(report.filters.to)} (end exclusive)</p><p className={styles.muted}>{report.filters.environment} · {report.filters.traffic} · Source: {report.filters.source || "all"} · Campaign: {report.filters.campaign || "all"} · Project: {report.filters.project || "all"}</p><p className={styles.muted}>Last matching ingestion: {utc(report.summary.freshness)} · Generated: {utc(report.generatedAt)}</p></div>
        <button onClick={() => void exportEvents()} disabled={exportState === "loading"}>{exportState === "loading" ? "Preparing export…" : "Export matching events"}</button>
      </section>
      {exportMessage && <p className={styles.notice} role="status">{exportMessage}</p>}
      {report.sourceMetadata && <section className={styles.notice} aria-label="Tracker source status">
        <p>Existing Google tracker · fetched {utc(report.sourceMetadata.fetchedAt)} · {report.sourceMetadata.totalRows.toLocaleString("en-US")} source rows.</p>
        {report.sourceMetadata.warnings.map((warning) => <p key={warning}>{warning}</p>)}
      </section>}
      {report.definitions.partialData && <p className={styles.notice}>{report.definitions.partialData}</p>}
      <dl className={styles.metrics}>
        {[
          ["Sessions", report.summary.sessions.toLocaleString("en-US")],
          ["Page views", report.summary.pageViews.toLocaleString("en-US")],
          ["Clicks", report.summary.clicks.toLocaleString("en-US")],
          ...(intervalAvailable ? [["Active time (interval deltas)", activeTime(report.summary.activeMs)]] : []),
          ...(!intervalAvailable || report.summary.legacyActiveMs > 0 ? [["Tracked active time (session maxima)", activeTime(report.summary.legacyActiveMs)]] : []),
          ["Events", report.summary.events.toLocaleString("en-US")],
          ["Recipient-link sessions", report.summary.attributedSessions.toLocaleString("en-US")],
        ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
      </dl>
      {(!intervalAvailable || report.summary.legacyActiveMs > 0) && <section className={styles.panel} aria-label="Tracked active time coverage">
        <h2>Tracked active time coverage</h2>
        <p className={styles.muted}>This sums the largest tracked value in each matching session. Historical visible-tab timing can include idle time; newer tracking requires focus and recent input. A filtered session maximum may include earlier session activity. These values do not prove attention.</p>
        {!intervalAvailable && <p className={styles.muted}>Interval active-time deltas are unavailable for this tracker source, so they are omitted from summaries, breakdowns and journeys.</p>}
      </section>}
      {report.summary.events === 0 ? <section className={styles.message} role="status">
        <h2>{hasNarrowingFilter ? "No matching results" : "No traffic in this window"}</h2>
        <p>{hasNarrowingFilter ? "Clear a source, campaign or project filter, or choose another UTC date range." : "No persisted events match this environment, traffic cohort and UTC date range."}</p>
      </section> : <>
        {(report.sessionsTruncated || report.sessions.some((session) => session.eventsTruncated)) && <p className={styles.notice}>Partial journeys: the view is limited to 100 sessions and 500 matching events per session. Summary totals include all matching events.</p>}
        <section className={styles.visuals} aria-label="Activity comparisons">
          <div className={styles.sectionHeading}><h2>Where activity happens</h2><p className={styles.muted}>Compare the leading pages, projects and sources in the applied filters. Bars show event counts, not unique people.</p></div>
          <div className={styles.chartGrid}>
            <BreakdownChart title="Top pages" rows={report.pages} />
            <BreakdownChart title="Top projects" rows={report.projects} />
            <BreakdownChart title="Top sources" rows={report.sources} />
          </div>
        </section>
        <section className={styles.journeys} aria-label="Session journeys"><div className={styles.sectionHeading}><h2>Session journeys</h2><p className={styles.muted}>Only events matching the applied filters are shown. Coded links establish link usage, not visitor identity. Open a card for its events.</p></div><div className={styles.sessionGrid}>{report.sessions.map((session) => <SessionDetails key={`${session.origin}:${session.sessionId}`} session={session} intervalAvailable={intervalAvailable} />)}</div></section>
        <div className={styles.sectionHeading}><h2>Detailed breakdowns</h2><p className={styles.muted}>Each breakdown displays up to 100 groups. Sessions can appear in multiple groups; do not add group counts to infer unique people.</p></div>
        <div className={styles.breakdowns}>
          <BreakdownTable title="Sources" rows={report.sources} intervalAvailable={intervalAvailable} /><BreakdownTable title="Campaigns" rows={report.campaigns} intervalAvailable={intervalAvailable} />
          <BreakdownTable title="Projects" rows={report.projects} intervalAvailable={intervalAvailable} /><BreakdownTable title="Pages" rows={report.pages} intervalAvailable={intervalAvailable} />
        </div>
        <BreakdownTable title="Click and navigation targets" rows={report.targets} intervalAvailable={intervalAvailable} />
      </>}
      <section className={styles.definitions} aria-label="Metric definitions"><h2>Definitions and coverage</h2><dl>{Object.entries(report.definitions).map(([term, definition]) => <div key={term}><dt>{term}</dt><dd>{definition}</dd></div>)}</dl><p>Anonymous sessions are not verified people. Consent, blockers, offline failures and retention can leave gaps. Legacy imported active time may include idle visible-tab time.</p></section>
    </>}
  </section>;
}
