import "server-only";
import { Temporal } from "@js-temporal/polyfill";
import { unzipSync, strFromU8 } from "fflate";
import { XMLParser } from "fast-xml-parser";
import { PUBLIC_ROUTES, type StoredEvent } from "./schema";

export interface SheetDataset {
  events: StoredEvent[];
  fetchedAt: string;
  sourceFreshness: string | null;
  warnings: string[];
  rowCount: number;
  heldRows: number;
  duplicateRows: number;
}
export class TrackerSheetUnavailable extends Error {
  constructor() { super("The existing tracker could not be loaded. Try again shortly."); this.name = "TrackerSheetUnavailable"; }
}
const MAX_DOWNLOAD = 8 * 1024 * 1024;
const MAX_XML = 32 * 1024 * 1024;
const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@", parseTagValue: false, processEntities: false });
type XmlNode = Record<string, unknown>;
const list = (value: unknown): unknown[] => value === undefined || value === null ? [] : Array.isArray(value) ? value : [value];
const node = (value: unknown): XmlNode => value && typeof value === "object" && !Array.isArray(value) ? value as XmlNode : {};
function text(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(text).join("");
  const object = node(value);
  return "#text" in object ? text(object["#text"]) : "t" in object ? text(object.t) : "r" in object ? text(object.r) : "";
}
function xml(data: Uint8Array | undefined): XmlNode {
  if (!data) throw new TrackerSheetUnavailable();
  const source = strFromU8(data);
  if (/<!DOCTYPE|<!ENTITY/i.test(source)) throw new TrackerSheetUnavailable();
  return node(parser.parse(source));
}
export function excelTimestamp(value: unknown, timezone: string, date1904 = false): string {
  if (typeof value === "string" && /^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(value)) return Temporal.Instant.from(value).toString({ smallestUnit: "millisecond" });
  const serial = Number(value);
  if (!Number.isFinite(serial) || serial <= 0 || serial > 200000) throw new Error("Invalid source date");
  const epoch = Date.parse(date1904 ? "1904-01-01T00:00:00Z" : "1899-12-30T00:00:00Z");
  const walltime = Temporal.Instant.fromEpochMilliseconds(epoch + Math.round(serial * 86_400_000)).toZonedDateTimeISO("UTC").toPlainDateTime();
  return walltime.toZonedDateTime(timezone, { disambiguation: "reject" }).toInstant().toString({ smallestUnit: "millisecond" });
}
const safeToken = (value: unknown, max = 80): string | undefined => typeof value === "string" && new RegExp(`^[a-zA-Z0-9._~-]{1,${max}}$`).test(value) ? value : undefined;
const originalId = (value: unknown): string => {
  const token = safeToken(value, 160); if (!token) throw new Error("Invalid source identifier"); return token;
};
function optionalNumber(value: unknown, maximum: number): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0 || number > maximum) throw new Error("Invalid source metric");
  return number;
}
export function normalizeSheetEvent(row: Record<string, string>, timezone: string, date1904 = false): StoredEvent {
  const route = PUBLIC_ROUTES.find((path) => path === String(row.Page || "").split(/[?#]/)[0]);
  if (!route) throw new Error("Unknown source route");
  const types: Record<string, StoredEvent["type"]> = { "page-view": "page_view", "scroll-depth": "scroll", "active-time": "engagement", "meaningful-click": "click", "high-intent": "click", "session-qualified": "session_qualified", "form-submit": "form_submit" };
  const name = row.Event?.replaceAll("_", "-");
  const type = Object.hasOwn(types, name) ? types[name] : undefined;
  if (typeof type !== "string") throw new Error("Unknown source event");
  const eventId = originalId(row["Event ID"]), sessionId = originalId(row["Session ID"]);
  const source = safeToken(row.Source), medium = safeToken(row.Medium), campaign = safeToken(row.Campaign);
  // Keep ordinary referral hosts separate from the explicit validation label and observed historical namespace.
  const test = source?.toLowerCase() === "tracker-validation" || /^tracker-test-/i.test(sessionId);
  let origin = "legacy:portfolio-v1";
  try { const value = new URL(row["Site Origin"]); if (value.protocol === "https:" && value.origin === row["Site Origin"] && value.origin.length <= 190) origin = `legacy:${value.origin}`; } catch { /* Older rows may not have a source origin. */ }
  return {
    origin, eventId, sessionId, type, occurredAt: excelTimestamp(row["Event Time"], timezone, date1904),
    sourceReceivedAt: excelTimestamp(row["Received At"], timezone, date1904),
    route, projectId: route.startsWith("/projects/") ? route.slice(10) : undefined,
    targetId: safeToken(row.Target, 100), scrollDepth: optionalNumber(row["Scroll Depth"], 100),
    legacyActiveMs: optionalNumber(row["Active Ms"], 21_600_000),
    attribution: { source, medium, campaign, recipientToken: safeToken(row["Recipient Token"], 64) },
    traffic: test ? "test" : "visitor", environment: "production", schemaVersion: 1,
    provenance: "legacy-import", appVersion: "legacy-v1", contentVersion: "legacy-unknown",
  };
}
export function parseTrackerWorkbook(data: Uint8Array, options: { timezone?: string; fetchedAt?: string } = {}): SheetDataset {
  if (data.byteLength > MAX_DOWNLOAD) throw new TrackerSheetUnavailable();
  const timezone = options.timezone || "America/New_York";
  // Validate the configured zone before classifying row-specific failures.
  Temporal.Now.zonedDateTimeISO(timezone);
  let inflated = 0;
  const archive = unzipSync(data, { filter: (entry) => {
    if (!/^xl\/(?:workbook\.xml|_rels\/workbook\.xml\.rels|sharedStrings\.xml|worksheets\/[^/]+\.xml)$/.test(entry.name)) return false;
    inflated += entry.originalSize;
    if (entry.originalSize > 16 * 1024 * 1024 || inflated > MAX_XML) throw new TrackerSheetUnavailable();
    return true;
  } });
  const workbook = node(xml(archive["xl/workbook.xml"]).workbook);
  const relations = list(node(xml(archive["xl/_rels/workbook.xml.rels"]).Relationships).Relationship);
  const strings = archive["xl/sharedStrings.xml"] ? list(node(xml(archive["xl/sharedStrings.xml"]).sst).si).map(text) : [];
  const sheet = list(node(workbook.sheets).sheet).map(node).find((item) => item["@name"] === "Events");
  if (!sheet) throw new TrackerSheetUnavailable();
  const relation = relations.map(node).find((item) => item["@Id"] === sheet["@r:id"]);
  const target = String(relation?.["@Target"] || "");
  const path = target.startsWith("/") ? target.slice(1) : `xl/${target}`;
  if (!/^xl\/worksheets\/[^/.][^/]*\.xml$/.test(path)) throw new TrackerSheetUnavailable();
  const date1904 = ["1", "true"].includes(String(node(workbook.workbookPr)["@date1904"]));
  const sourceRows = list(node(node(xml(archive[path]).worksheet).sheetData).row);
  if (!sourceRows.length || sourceRows.length > 50_001) throw new TrackerSheetUnavailable();
  function cells(value: unknown): Record<string, string> {
    const output: Record<string, string> = {};
    for (const item of list(node(value).c).map(node)) {
      const column = String(item["@r"] || "").replace(/\d/g, "");
      const raw = text(item.v);
      output[column] = item["@t"] === "s" ? strings[Number(raw)] ?? "" : item["@t"] === "inlineStr" ? text(item.is) : raw;
    }
    return output;
  }
  const headers = cells(sourceRows[0]);
  const names = new Set(Object.values(headers));
  if (!["Event ID", "Session ID", "Event", "Page", "Event Time", "Received At", "Active Ms"].every((name) => names.has(name))) throw new TrackerSheetUnavailable();
  const events = new Map<string, StoredEvent>(), conflicts = new Set<string>();
  let heldRows = 0, duplicateRows = 0;
  for (const sourceRow of sourceRows.slice(1)) {
    const values = cells(sourceRow);
    if (!Object.values(values).some(Boolean)) continue;
    const row = Object.fromEntries(Object.entries(headers).map(([column, name]) => [name, values[column] || ""]));
    try {
      const event = normalizeSheetEvent(row, timezone, date1904);
      const key = JSON.stringify([event.origin, event.eventId]);
      if (conflicts.has(key)) { heldRows++; continue; }
      const existing = events.get(key);
      if (existing) {
        if (JSON.stringify(existing) === JSON.stringify(event)) duplicateRows++;
        else { events.delete(key); conflicts.add(key); heldRows += 2; }
      } else events.set(key, event);
    } catch { heldRows++; }
  }
  const rows = [...events.values()];
  if (!rows.length && heldRows) throw new TrackerSheetUnavailable();
  const warnings: string[] = [];
  if (heldRows) warnings.push(`${heldRows} source rows were held because dates, fields or duplicate IDs could not be interpreted safely. Totals are partial.`);
  if (duplicateRows) warnings.push(`${duplicateRows} identical source duplicates were counted once.`);
  return { events: rows, fetchedAt: options.fetchedAt || new Date().toISOString(), sourceFreshness: rows.reduce<string | null>((latest, event) => event.sourceReceivedAt && (!latest || event.sourceReceivedAt > latest) ? event.sourceReceivedAt : latest, null), warnings, rowCount: sourceRows.length - 1, heldRows, duplicateRows };
}
export async function fetchTrackerSheet(options: { sheetId?: string; timezone?: string; fetcher?: typeof fetch; timeoutMs?: number } = {}): Promise<SheetDataset> {
  const sheetId = options.sheetId || process.env.GOOGLE_TRACKER_SHEET_ID;
  if (!sheetId || !/^[a-zA-Z0-9_-]{20,150}$/.test(sheetId)) throw new TrackerSheetUnavailable();
  const timezone = options.timezone || process.env.ANALYTICS_SHEET_TIMEZONE || "America/New_York";
  try {
    const response = await (options.fetcher || fetch)(`https://docs.google.com/spreadsheets/d/${sheetId}/export?format=xlsx`, { cache: "no-store", redirect: "follow", signal: AbortSignal.timeout(options.timeoutMs || 10_000) });
    if (!response.ok || !/spreadsheetml|application\/octet-stream|application\/zip/.test(response.headers.get("content-type") || "")) throw new TrackerSheetUnavailable();
    const length = Number(response.headers.get("content-length") || 0);
    if (length > MAX_DOWNLOAD) throw new TrackerSheetUnavailable();
    const reader = response.body?.getReader(); if (!reader) throw new TrackerSheetUnavailable();
    let size = 0; const chunks: Uint8Array[] = [];
    try {
      while (true) { const part = await reader.read(); if (part.done) break; size += part.value.length; if (size > MAX_DOWNLOAD) { await reader.cancel(); throw new TrackerSheetUnavailable(); } chunks.push(part.value); }
    } finally { reader.releaseLock(); }
    const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    return parseTrackerWorkbook(bytes, { timezone, fetchedAt: new Date().toISOString() });
  } catch { throw new TrackerSheetUnavailable(); }
}
