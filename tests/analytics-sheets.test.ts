import { strToU8, zipSync } from "fflate";
import { describe, expect, it, vi } from "vitest";
import { excelTimestamp, fetchTrackerSheet, parseTrackerWorkbook } from "../lib/analytics/sheets";
import { sheetAnalyticsExport, sheetAnalyticsReport } from "../lib/analytics/sheet-report";
import { getAnalyticsReport, exportAnalyticsEvents } from "../lib/analytics/queries";

const headers = ["Received At", "Event Time", "Event ID", "Session ID", "Event", "Page", "Source", "Medium", "Campaign", "Scroll Depth", "Active Ms", "Target", "Site Origin", "Recipient Token", "IP"];
const serial = (value: string) => (Date.parse(`${value}Z`) - Date.parse("1899-12-30T00:00:00Z")) / 86400000;
const escape = (value: unknown) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;");
const column = (index: number) => String.fromCharCode(65 + index);
function workbook(rows: Record<string, string | number>[]): Uint8Array {
  const row = (values: (string | number)[], index: number) => `<row r="${index}">${values.map((value, cell) => typeof value === "number" ? `<c r="${column(cell)}${index}"><v>${value}</v></c>` : `<c r="${column(cell)}${index}" t="inlineStr"><is><t>${escape(value)}</t></is></c>`).join("")}</row>`;
  return zipSync({ "xl/workbook.xml": strToU8('<workbook><sheets><sheet name="Events" r:id="rId1"/></sheets></workbook>'), "xl/_rels/workbook.xml.rels": strToU8('<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>'), "xl/worksheets/sheet1.xml": strToU8(`<worksheet><sheetData>${row(headers, 1)}${rows.map((value, index) => row(headers.map((header) => value[header] ?? ""), index + 2)).join("")}</sheetData></worksheet>`) });
}
const base = { "Received At": serial("2026-09-20T10:01:40.100"), "Event Time": serial("2026-09-20T10:01:39.524"), "Event ID": "fixture-event-1", "Session ID": "fixture-session-1", Event: "page-view", Page: "/", Source: "resume", Medium: "pdf", Campaign: "fixture", "Active Ms": 0, "Site Origin": "https://portfolio.example", IP: "sensitive-value-must-disappear" };
const filters = { from: "2026-09-01T00:00:00Z", to: "2026-11-11T00:00:00Z", environment: "production", traffic: "all" };
describe("existing Google Sheet adapter", () => {
  it("preserves serial milliseconds and Eastern daylight rules; rejects ambiguous local times", () => {
    expect(excelTimestamp(base["Event Time"], "America/New_York")).toBe("2026-09-20T14:01:39.524Z");
    expect(excelTimestamp(serial("2026-11-10T08:30:43.238"), "America/New_York")).toBe("2026-11-10T13:30:43.238Z");
    expect(() => excelTimestamp(serial("2026-11-01T01:30:00.000"), "America/New_York")).toThrow();
    expect(() => excelTimestamp(serial("2026-03-08T02:30:00.000"), "America/New_York")).toThrow();
  });
  it("reads actual cells, excludes sensitive fields and reports partial rows", () => {
    const data = parseTrackerWorkbook(workbook([base, base, { ...base, "Event ID": "fixture-held", "Event Time": serial("2026-11-01T01:30:00.000") }]), { fetchedAt: "2026-11-10T15:00:00Z" });
    expect(data.events).toHaveLength(1); expect(data.duplicateRows).toBe(1); expect(data.heldRows).toBe(1);
    expect(data.events[0].occurredAt).toBe("2026-09-20T14:01:39.524Z"); expect(data.warnings.length).toBe(2);
    expect(JSON.stringify(data)).not.toContain("sensitive-value"); expect(JSON.stringify(data)).not.toContain('"IP"');
  });
  it.each(["constructor", "__proto__", "toString"])("holds inherited-object event name %s without invalidating report serialization", (name) => {
    const data = parseTrackerWorkbook(workbook([base, { ...base, "Event ID": "unknown-event", Event: name }]));
    expect(data.heldRows).toBe(1);
    expect(data.events).toHaveLength(1);
    const report = sheetAnalyticsReport(data, filters);
    const serialized = JSON.parse(JSON.stringify(report));
    expect(serialized.summary.events).toBe(1);
    expect(serialized.sessions[0].events).toEqual([expect.objectContaining({ type: "page_view" })]);
    expect(serialized.sourceMetadata.heldRows).toBe(1);
    expect(serialized.definitions.partialData).toContain("partial");
  });
  it("holds conflicting duplicate IDs instead of selecting an arbitrary event", () => {
    const data = parseTrackerWorkbook(workbook([base, { ...base, Page: "/about" }, { ...base, "Event ID": "unconflicted-event" }]));
    expect(data.events).toHaveLength(1); expect(data.heldRows).toBe(2); expect(data.warnings[0]).toContain("partial");
  });
  it.each(["auditboard.com", "contest.com", "validation.com", "tracker-validation-extra"])("keeps genuine referral source %s in visitor reports", (source) => {
    const data = parseTrackerWorkbook(workbook([{ ...base, Source: source }]));
    expect(data.events[0].traffic).toBe("visitor");
    expect(sheetAnalyticsReport(data, { ...filters, traffic: "visitor" }).summary.events).toBe(1);
    expect(sheetAnalyticsReport(data, { ...filters, traffic: "test" }).summary.events).toBe(0);
  });
  it("recognizes only the explicit test source and observed anchored historical session namespace", () => {
    for (const patch of [{ Source: "tracker-validation" }, { Source: "TRACKER-VALIDATION" }, { "Session ID": "tracker-test-historical-fixture" }]) {
      expect(parseTrackerWorkbook(workbook([{ ...base, ...patch }])).events[0].traffic).toBe("test");
    }
    for (const sessionId of ["contest-session", "prefix-tracker-test-fixture", "test-unverified-prefix", "audit-unverified-prefix", "tracker-validation-unverified-prefix"]) {
      expect(parseTrackerWorkbook(workbook([{ ...base, "Session ID": sessionId }])).events[0].traffic).toBe("visitor");
    }
  });
  it("aggregates cumulative history as per-session maxima and keeps test cohorts separate", () => {
    const data = parseTrackerWorkbook(workbook([base, { ...base, "Event ID": "active-one", Event: "active-time", "Active Ms": 15000 }, { ...base, "Event ID": "active-two", Event: "active-time", "Active Ms": 30000 }, { ...base, "Event ID": "test-click", "Session ID": "tracker-validation-session", Source: "tracker-validation", Event: "meaningful-click", Target: "nav.about" }]));
    const report = sheetAnalyticsReport(data, filters);
    expect(report.summary).toMatchObject({ events: 4, sessions: 2, pageViews: 1, clicks: 1, activeMs: 0, legacyActiveMs: 30000, attributedSessions: 0 });
    expect(report.sessions.every((session) => session.attribution === "anonymous")).toBe(true);
    expect(sheetAnalyticsReport(data, { ...filters, traffic: "visitor" }).summary.events).toBe(3);
    expect(sheetAnalyticsReport(data, { ...filters, source: "missing" }).summary).toMatchObject({ events: 0, sessions: 0, freshness: null });
    expect(sheetAnalyticsReport(data, { ...filters, environment: "preview" }).summary.events).toBe(0);
    const exported = sheetAnalyticsExport(data, filters); expect(exported.events).toHaveLength(4); expect(exported.events[0]).toHaveProperty("source_received_at");
    expect(report.sourceMetadata?.backend).toBe("google-sheets");
  });
  it("routes reports and exports through the existing Sheet with no database fallback", async () => {
    vi.stubEnv("GOOGLE_TRACKER_SHEET_ID", "fixture_sheet_identifier_123456789");
    const bytes = workbook([base]);
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockImplementation(async () => new Response(new Uint8Array(bytes), { headers: { "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" } })));
    try {
      expect((await getAnalyticsReport(filters)).summary.events).toBe(1);
      expect((await exportAnalyticsEvents(filters)).events).toHaveLength(1);
      vi.stubEnv("GOOGLE_TRACKER_SHEET_ID", "");
      await expect(getAnalyticsReport(filters)).rejects.toThrow("tracker could not be loaded");
    } finally { vi.unstubAllGlobals(); vi.unstubAllEnvs(); }
  });
  it("rejects unsupported upstream responses and oversized downloads without exposing source URLs", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response("login page", { status: 200, headers: { "content-type": "text/html" } }));
    await expect(fetchTrackerSheet({ sheetId: "fixture_sheet_identifier_123456789", fetcher })).rejects.toThrow("tracker could not be loaded");
    fetcher.mockResolvedValue(new Response("", { headers: { "content-type": "application/zip", "content-length": String(9 * 1024 * 1024) } }));
    await expect(fetchTrackerSheet({ sheetId: "fixture_sheet_identifier_123456789", fetcher })).rejects.toThrow("tracker could not be loaded");
    fetcher.mockResolvedValue(new Response(new Uint8Array(workbook([base])), { headers: { "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" } }));
    expect((await fetchTrackerSheet({ sheetId: "fixture_sheet_identifier_123456789", fetcher })).events).toHaveLength(1);
    expect(fetcher.mock.calls.at(-1)?.[1]?.cache).toBe("no-store");
  });
});
