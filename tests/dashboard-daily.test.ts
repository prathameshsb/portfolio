import { describe, expect, it } from "vitest";
import { sheetAnalyticsReport } from "../lib/analytics/sheet-report";
import type { StoredEvent } from "../lib/analytics/schema";
import type { SheetDataset } from "../lib/analytics/sheets";

const filters = {
  from: "2026-11-01T00:00:00.000Z", to: "2026-11-04T00:00:00.000Z",
  environment: "production", traffic: "visitor",
};
function event(index: number, patch: Partial<StoredEvent> = {}): StoredEvent {
  return {
    eventId: `event-${index}`, sessionId: `session-${index}`, origin: "https://portfolio.example",
    type: "page_view", occurredAt: "2026-11-01T12:00:00.000Z", route: "/",
    traffic: "visitor", environment: "production", schemaVersion: 2,
    provenance: "browser-v2", appVersion: "fixture", contentVersion: "fixture", ...patch,
  };
}
function dataset(events: StoredEvent[]): SheetDataset {
  return {
    events, fetchedAt: "2026-11-10T12:00:00.000Z", sourceFreshness: null,
    warnings: [], rowCount: events.length, heldRows: 0, duplicateRows: 0,
  };
}

describe("daily activity from the complete filtered report", () => {
  it("zero-fills every selected UTC day, including a genuinely empty window", () => {
    expect(sheetAnalyticsReport(dataset([]), filters).dailyActivity).toEqual([
      { date: "2026-11-01", pageViews: 0, clicks: 0, events: 0 },
      { date: "2026-11-02", pageViews: 0, clicks: 0, events: 0 },
      { date: "2026-11-03", pageViews: 0, clicks: 0, events: 0 },
    ]);
  });

  it("includes the start, excludes the end, and assigns midnight events to the new UTC day", () => {
    const report = sheetAnalyticsReport(dataset([
      event(1, { occurredAt: "2026-10-31T23:59:59.999Z" }),
      event(2, { occurredAt: filters.from }),
      event(3, { type: "click", targetId: "nav.about", occurredAt: "2026-11-02T00:00:00.000Z" }),
      event(4, { type: "scroll", scrollDepth: 50, occurredAt: "2026-11-03T23:59:59.999Z" }),
      event(5, { occurredAt: filters.to }),
    ]), filters);
    expect(report.dailyActivity).toEqual([
      { date: "2026-11-01", pageViews: 1, clicks: 0, events: 1 },
      { date: "2026-11-02", pageViews: 0, clicks: 1, events: 1 },
      { date: "2026-11-03", pageViews: 0, clicks: 0, events: 1 },
    ]);
    expect(report.summary.events).toBe(3);
  });

  it("uses exactly the report cohort and source, campaign, and project filters", () => {
    const match = {
      route: "/projects/nexa" as const, projectId: "nexa",
      attribution: { source: "resume", campaign: "application" },
    };
    const events = [
      event(1, match),
      event(2, { ...match, traffic: "test" }),
      event(3, { ...match, environment: "preview" }),
      event(4, { ...match, attribution: { source: "other", campaign: "application" } }),
      event(5, { ...match, attribution: { source: "resume", campaign: "other" } }),
      event(6, { ...match, route: "/projects/flexrent", projectId: "flexrent" }),
    ];
    const report = sheetAnalyticsReport(dataset(events), {
      ...filters, source: "resume", campaign: "application", project: "nexa",
    });
    expect(report.dailyActivity?.reduce((total, day) => total + day.events, 0)).toBe(1);
    expect(report.dailyActivity?.[0]).toMatchObject({ events: 1, pageViews: 1 });
  });

  it("includes activity beyond both the 100-session and 500-event journey display caps", () => {
    const events = Array.from({ length: 150 }, (_, index) => event(index));
    events.push(...Array.from({ length: 501 }, (_, index) => event(150 + index, {
      sessionId: "large-session", type: "click", targetId: "nav.about",
      occurredAt: "2026-11-03T12:00:00.000Z",
    })));
    const report = sheetAnalyticsReport(dataset(events), filters);
    expect(report.sessions).toHaveLength(100);
    expect(report.sessionsTruncated).toBe(true);
    expect(report.sessions.find((session) => session.sessionId === "large-session")?.events).toHaveLength(500);
    expect(report.dailyActivity).toEqual([
      { date: "2026-11-01", pageViews: 150, clicks: 0, events: 150 },
      { date: "2026-11-02", pageViews: 0, clicks: 0, events: 0 },
      { date: "2026-11-03", pageViews: 0, clicks: 501, events: 501 },
    ]);
    expect(report.dailyActivity?.reduce((total, day) => total + day.events, 0)).toBe(report.summary.events);
  });

  it("keeps partial endpoint days when an API window does not start at midnight", () => {
    const report = sheetAnalyticsReport(dataset([
      event(1, { occurredAt: "2026-11-01T11:59:59.999Z" }),
      event(2, { occurredAt: "2026-11-02T11:59:59.999Z" }),
    ]), { ...filters, from: "2026-11-01T12:00:00.000Z", to: "2026-11-02T12:00:00.000Z" });
    expect(report.dailyActivity).toEqual([
      { date: "2026-11-01", pageViews: 0, clicks: 0, events: 0 },
      { date: "2026-11-02", pageViews: 1, clicks: 0, events: 1 },
    ]);
  });

  it("zero-fills the maximum supported 366-day dashboard window", () => {
    const report = sheetAnalyticsReport(dataset([]), {
      ...filters, from: "2026-01-01T00:00:00.000Z", to: "2027-01-02T00:00:00.000Z",
    });
    expect(report.dailyActivity).toHaveLength(366);
    expect(report.dailyActivity?.at(-1)?.date).toBe("2027-01-01");
  });
});
