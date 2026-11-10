import type { SheetDataset } from "./sheets";
import type { StoredEvent } from "./schema";
import { ReportFiltersSchema, REPORT_DEFINITIONS, type AnalyticsReport, type Breakdown, type DailyActivity, type ReportFilters, type SessionJourney } from "./queries";

const key = (event: StoredEvent) => JSON.stringify([event.origin, event.sessionId]);
export function matchingSheetEvents(dataset: SheetDataset, input: unknown): { filters: ReportFilters; events: StoredEvent[] } {
  const filters = ReportFiltersSchema.parse(input);
  const events = dataset.events.filter((event) => Date.parse(event.occurredAt) >= Date.parse(filters.from) && Date.parse(event.occurredAt) < Date.parse(filters.to) && event.environment === filters.environment && (filters.traffic === "all" || event.traffic === filters.traffic) && (!filters.source || event.attribution?.source === filters.source) && (!filters.campaign || event.attribution?.campaign === filters.campaign) && (!filters.project || event.projectId === filters.project));
  return { filters, events };
}
function aggregate(events: StoredEvent[]): Omit<Breakdown, "label"> {
  return { events: events.length, sessions: new Set(events.map(key)).size, pageViews: events.filter((event) => event.type === "page_view").length, clicks: events.filter((event) => event.type === "click").length, activeMs: events.reduce((total, event) => total + (event.activeMs || 0), 0), maxScroll: Math.max(0, ...events.map((event) => event.scrollDepth || 0)) };
}
function groups(events: StoredEvent[], label: (event: StoredEvent) => string): Breakdown[] {
  const grouped = new Map<string, StoredEvent[]>();
  for (const event of events) { const name = label(event); const list = grouped.get(name) || []; list.push(event); grouped.set(name, list); }
  return [...grouped].map(([name, entries]) => ({ label: name, ...aggregate(entries) })).sort((a, b) => b.events - a.events || a.label.localeCompare(b.label)).slice(0, 100);
}
function dailyActivity(events: StoredEvent[], filters: ReportFilters): DailyActivity[] {
  const days = new Map<string, DailyActivity>();
  const firstDay = new Date(filters.from);
  firstDay.setUTCHours(0, 0, 0, 0);
  for (let day = firstDay.getTime(); day < Date.parse(filters.to); day += 86_400_000) {
    const date = new Date(day).toISOString().slice(0, 10);
    days.set(date, { date, pageViews: 0, clicks: 0, events: 0 });
  }
  for (const event of events) {
    const day = days.get(new Date(event.occurredAt).toISOString().slice(0, 10));
    if (!day) continue;
    day.events += 1;
    if (event.type === "page_view") day.pageViews += 1;
    if (event.type === "click") day.clicks += 1;
  }
  return [...days.values()];
}
export function sheetAnalyticsReport(dataset: SheetDataset, input: unknown): AnalyticsReport {
  const { filters, events } = matchingSheetEvents(dataset, input);
  const sessions = new Map<string, StoredEvent[]>();
  for (const event of events) { const id = key(event); const group = sessions.get(id) || []; group.push(event); sessions.set(id, group); }
  let legacyActiveMs = 0;
  const journeys: SessionJourney[] = [...sessions.values()].map((group): SessionJourney => {
    group.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.eventId.localeCompare(b.eventId));
    const first = group[0], last = group[group.length - 1];
    const maximum = Math.max(0, ...group.map((event) => event.legacyActiveMs || 0)); legacyActiveMs += maximum;
    const recipient = group.find((event) => event.attribution?.recipientToken)?.attribution?.recipientToken || null;
    return { origin: first.origin, sessionId: first.sessionId, firstSeen: first.occurredAt, lastSeen: last.occurredAt, source: group.find((event) => event.attribution?.source)?.attribution?.source || null, campaign: group.find((event) => event.attribution?.campaign)?.attribution?.campaign || null, recipientToken: recipient, attribution: recipient ? "recipient-link" : "anonymous", traffic: first.traffic, activeMs: group.reduce((total, event) => total + (event.activeMs || 0), 0), legacyActiveMs: maximum, eventsTruncated: group.length > 500, events: group.slice(0, 500).map((event) => ({ eventId: event.eventId, type: event.type, occurredAt: event.occurredAt, route: event.route, projectId: event.projectId || null, targetId: event.targetId || null, activeMs: event.activeMs ?? null, scrollDepth: event.scrollDepth ?? null })) };
  }).sort((a, b) => b.lastSeen.localeCompare(a.lastSeen) || a.origin.localeCompare(b.origin) || a.sessionId.localeCompare(b.sessionId));
  const all = aggregate(events);
  const totals = { events: all.events, sessions: all.sessions, pageViews: all.pageViews, clicks: all.clicks, activeMs: all.activeMs };
  const freshness = events.reduce<string | null>((latest, event) => event.sourceReceivedAt && (!latest || event.sourceReceivedAt > latest) ? event.sourceReceivedAt : latest, null);
  return {
    filters, summary: { ...totals, legacyActiveMs, attributedSessions: journeys.filter((session) => session.attribution === "recipient-link").length, freshness },
    dailyActivity: dailyActivity(events, filters),
    sources: groups(events, (event) => event.attribution?.source || "direct / untagged"), campaigns: groups(events, (event) => event.attribution?.campaign || "untagged"), projects: groups(events, (event) => event.projectId || "non-project pages"), pages: groups(events, (event) => event.route), targets: groups(events.filter((event) => event.targetId), (event) => event.targetId!), sessions: journeys.slice(0, 100), sessionsTruncated: journeys.length > 100, generatedAt: dataset.fetchedAt,
    definitions: { ...REPORT_DEFINITIONS, activeMs: "Interval active-time values are unavailable in this tracker source. They are not represented as zero attention.", legacyActiveMs: "Tracked active time sums each session’s largest stored cumulative value. Historical visible-tab timing can include idle time; the newer collector requires focus and recent input. A filtered window may include earlier activity within those sessions. These maxima do not prove attention.", freshness: "Newest original tracker receipt in the selected cohort. This dashboard reads the existing persistent Google Sheet; latest fetch time does not prove all visits were captured.", source: "Existing Google tracker. Original event/session IDs are retained. UTC conversion uses the configured source timezone; tracked time remains cumulative session maxima.", ...(dataset.warnings.length ? { partialData: dataset.warnings.join(" ") } : {}) },
    sourceMetadata: { backend: "google-sheets", fetchedAt: dataset.fetchedAt, sourceFreshness: dataset.sourceFreshness, totalRows: dataset.rowCount, heldRows: dataset.heldRows, duplicateRows: dataset.duplicateRows, warnings: dataset.warnings },
  };
}
export function sheetAnalyticsExport(dataset: SheetDataset, input: unknown): { events: Record<string, unknown>[]; truncated: boolean; filters: ReportFilters } {
  const { filters, events } = matchingSheetEvents(dataset, input);
  const sorted = [...events].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.eventId.localeCompare(b.eventId));
  return { filters, truncated: sorted.length > 10000, events: sorted.slice(0, 10000).map((event) => ({ origin: event.origin, event_id: event.eventId, session_id: event.sessionId, schema_version: event.schemaVersion, provenance: event.provenance, environment: event.environment, traffic: event.traffic, event_type: event.type, occurred_at: event.occurredAt, source_received_at: event.sourceReceivedAt, route: event.route, project_id: event.projectId, target_id: event.targetId, scroll_depth: event.scrollDepth, active_ms: event.activeMs, legacy_active_ms: event.legacyActiveMs, source: event.attribution?.source, medium: event.attribution?.medium, campaign: event.attribution?.campaign, recipient_token: event.attribution?.recipientToken, app_version: event.appVersion, content_version: event.contentVersion })) };
}
