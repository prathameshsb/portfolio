import type { AnalyticsBatch, EventInput } from "./schema";
import type { AnalyticsEnvironment } from "./schema";

export class TrackerWriteUnavailable extends Error { constructor() { super("Tracker write unavailable"); this.name = "TrackerWriteUnavailable"; } }
export class TrackerWriteInvalid extends Error { constructor() { super("Cumulative engagement value required"); this.name = "TrackerWriteInvalid"; } }
interface LegacyWriteEvent {
  version: 1; eventId: string; sessionId: string; name: string; ts: string; siteOrigin: string;
  page: string; path: string; referrerCategory: string; utm: { source?: string; medium?: string; campaign?: string };
  caseStudy?: string; target?: string; scrollDepth?: number; activeMs?: number; totalActiveMs?: number; recipientToken?: string;
}
export interface TrackerWriteResult { accepted: string[]; duplicates: string[]; ignored: string[] }
function legacyEvent(event: EventInput, origin: string): LegacyWriteEvent {
  const names = { page_view: "page_view", click: "meaningful_click", scroll: "scroll_depth", engagement: "active_time", page_exit: "" };
  if (event.type === "engagement" && !event.totalActiveMs) throw new TrackerWriteInvalid();
  return {
    version: 1, eventId: event.eventId, sessionId: event.sessionId, name: names[event.type], ts: event.occurredAt,
    siteOrigin: origin, page: event.projectId || (event.route === "/" ? "home" : "other-page"), path: event.route,
    referrerCategory: "unknown", utm: { source: event.traffic === "test" ? "tracker-validation" : event.attribution?.source, medium: event.attribution?.medium, campaign: event.attribution?.campaign },
    caseStudy: event.projectId, target: event.targetId, scrollDepth: event.scrollDepth,
    activeMs: event.activeMs, totalActiveMs: event.totalActiveMs, recipientToken: event.attribution?.recipientToken,
  };
}
export function mapSheetWriteBatch(batch: AnalyticsBatch, origin: string, environment: AnalyticsEnvironment): { events: LegacyWriteEvent[]; ignored: string[] } {
  const ignored: string[] = [], events: LegacyWriteEvent[] = [];
  for (const event of batch.events) {
    // The existing tracker has no exit event; never manufacture an interaction or qualify a visitor for it.
    if (event.type === "page_exit" || event.traffic === "owner" || (environment !== "production" && event.traffic !== "test")) ignored.push(event.eventId);
    else events.push(legacyEvent(event, origin));
  }
  return { events, ignored };
}
export async function ingestSheetBatch(batch: AnalyticsBatch, origin: string, environment: AnalyticsEnvironment, options: { env?: Partial<NodeJS.ProcessEnv>; fetcher?: typeof fetch } = {}): Promise<TrackerWriteResult> {
  const env = options.env || process.env;
  if (env.ANALYTICS_SHEETS_WRITE_ENABLED !== "true") throw new TrackerWriteUnavailable();
  const endpoint = env.GOOGLE_TRACKER_ENDPOINT;
  if (!endpoint) throw new TrackerWriteUnavailable();
  try { const url = new URL(endpoint); if (url.protocol !== "https:" || url.hostname !== "script.google.com" || !/^\/macros\/s\/[a-zA-Z0-9_-]+\/exec$/.test(url.pathname) || url.search || url.hash || url.username || url.password) throw new Error(); }
  catch { throw new TrackerWriteUnavailable(); }
  const mapped = mapSheetWriteBatch(batch, origin, environment);
  if (!mapped.events.length) return { accepted: [], duplicates: [], ignored: mapped.ignored };
  try {
    const result = await (options.fetcher || fetch)(endpoint, { method: "POST", headers: { "Content-Type": "text/plain;charset=UTF-8" }, body: JSON.stringify({ version: 1, events: mapped.events }), cache: "no-store", redirect: "follow", signal: AbortSignal.timeout(10_000) });
    if (!result.ok) throw new TrackerWriteUnavailable();
    const reader = result.body?.getReader(); if (!reader) throw new TrackerWriteUnavailable();
    let size = 0; const chunks: Uint8Array[] = [];
    try {
      while (true) { const part = await reader.read(); if (part.done) break; size += part.value.byteLength; if (size > 64 * 1024) { await reader.cancel(); throw new TrackerWriteUnavailable(); } chunks.push(part.value); }
    } finally { reader.releaseLock(); }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    const acknowledgment: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    if (!acknowledgment || typeof acknowledgment !== "object" || Array.isArray(acknowledgment)) throw new TrackerWriteUnavailable();
    const value = acknowledgment as Record<string, unknown>;
    if (value.ok !== true || !Number.isInteger(value.accepted) || !Number.isInteger(value.duplicates) || (value.accepted as number) < 0 || (value.duplicates as number) < 0 || !Array.isArray(value.rejected) || value.rejected.length || (value.accepted as number) + (value.duplicates as number) !== mapped.events.length) throw new TrackerWriteUnavailable();
    // The source acknowledges counts, not ID lists. A full accepted+duplicate batch confirms every submitted ID.
    return { accepted: mapped.events.map((event) => event.eventId), duplicates: [], ignored: mapped.ignored };
  } catch { throw new TrackerWriteUnavailable(); }
}
