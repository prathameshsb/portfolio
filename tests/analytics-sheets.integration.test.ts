import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { fetchTrackerSheet, parseTrackerWorkbook } from "../lib/analytics/sheets";
import { sheetAnalyticsExport, sheetAnalyticsReport } from "../lib/analytics/sheet-report";

const live = process.env.ANALYTICS_SHEETS_LIVE_READ === "true";
const fixture = process.env.ANALYTICS_SHEETS_XLSX_FIXTURE;
const suite = live || fixture ? describe : describe.skip;
suite("private existing tracker read integration", () => {
  it("reads persistent source and reconciles reports without database or source mutation", async () => {
    const dataset = live ? await fetchTrackerSheet() : parseTrackerWorkbook(new Uint8Array(readFileSync(fixture!)));
    expect(dataset.events.length).toBeGreaterThan(0);
    expect(dataset.heldRows).toBe(0);
    expect(dataset.events.every((event) => event.eventId && event.sessionId && /Z$/.test(event.occurredAt))).toBe(true);
    const filters = { from: "2026-09-01T00:00:00Z", to: "2026-12-01T00:00:00Z", traffic: "all", environment: "production" };
    const report = sheetAnalyticsReport(dataset, filters), exported = sheetAnalyticsExport(dataset, filters);
    expect(report.summary.events).toBe(dataset.events.length);
    expect(report.summary.sessions).toBe(new Set(dataset.events.map((event) => JSON.stringify([event.origin, event.sessionId]))).size);
    expect(exported.events.length).toBe(dataset.events.length);
    const maxima = new Map<string, number>();
    for (const event of dataset.events) { const key = JSON.stringify([event.origin, event.sessionId]); maxima.set(key, Math.max(maxima.get(key) || 0, event.legacyActiveMs || 0)); }
    expect(report.summary.legacyActiveMs).toBe([...maxima.values()].reduce((total, value) => total + value, 0));
    expect(report.summary.freshness).toBe(dataset.sourceFreshness);
    expect(report.sourceMetadata?.backend).toBe("google-sheets");
  }, 20000);
});
