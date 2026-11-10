import { describe, expect, it, vi } from "vitest";
import { AnalyticsBatchSchema } from "../lib/analytics/schema";
import { ingestSheetBatch, mapSheetWriteBatch } from "../lib/analytics/sheets-ingestion";
const origin = "https://portfolio.example";
const env = { ANALYTICS_SHEETS_WRITE_ENABLED: "true", GOOGLE_TRACKER_ENDPOINT: "https://script.google.com/macros/s/fixture_existing_deployment/exec" };
const base = { eventId: "11111111-1111-4111-8111-111111111111", sessionId: "22222222-2222-4222-8222-222222222222", type: "page_view", occurredAt: "2026-11-10T14:00:00.000Z", route: "/", appVersion: "fixture", contentVersion: "fixture" };
const batch = (patch = {}) => AnalyticsBatchSchema.parse({ schemaVersion: 2, events: [{ ...base, ...patch }] });
describe("existing Apps Script write bridge", () => {
  it("maps exact version-one fields with stable IDs and cumulative session time", () => {
    const result = mapSheetWriteBatch(batch({ type: "engagement", activeMs: 15000, totalActiveMs: 45000, attribution: { source: "resume", medium: "pdf", campaign: "fixture" } }), origin, "production");
    expect(result.events[0]).toMatchObject({ version: 1, eventId: base.eventId, sessionId: base.sessionId, name: "active_time", ts: base.occurredAt, siteOrigin: origin, path: "/", activeMs: 15000, totalActiveMs: 45000, utm: { source: "resume", medium: "pdf", campaign: "fixture" } });
    expect(result.events[0]).not.toHaveProperty("appVersion");
    expect(() => mapSheetWriteBatch(batch({ type: "engagement", activeMs: 15000 }), origin, "production")).toThrow("Cumulative");
  });
  it("separates explicit test traffic and honestly ignores unsupported exits, owner and preview visitors", () => {
    expect(mapSheetWriteBatch(batch({ traffic: "test", attribution: { source: "resume", campaign: "fixture" } }), origin, "preview").events[0].utm).toMatchObject({ source: "tracker-validation", campaign: "fixture" });
    for (const patch of [{ type: "page_exit" }, { traffic: "owner" }]) expect(mapSheetWriteBatch(batch(patch), origin, "production")).toEqual({ events: [], ignored: [base.eventId] });
    expect(mapSheetWriteBatch(batch(), origin, "preview")).toEqual({ events: [], ignored: [base.eventId] });
  });
  it("acknowledges only the complete persisted-or-duplicate upstream batch", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ ok: true, accepted: 1, duplicates: 0, rejected: [] })));
    expect(await ingestSheetBatch(batch(), origin, "production", { env, fetcher })).toEqual({ accepted: [base.eventId], duplicates: [], ignored: [] });
    fetcher.mockResolvedValue(new Response(JSON.stringify({ ok: true, accepted: 0, duplicates: 1, rejected: [] })));
    expect((await ingestSheetBatch(batch(), origin, "production", { env, fetcher })).accepted).toEqual([base.eventId]);
    expect(fetcher.mock.calls[0][1]?.method).toBe("POST");
    expect(fetcher.mock.calls[0][1]?.cache).toBe("no-store");
  });
  it("keeps disabled, malformed, partial, busy and rejected responses unacknowledged", async () => {
    const fetcher = vi.fn<typeof fetch>();
    await expect(ingestSheetBatch(batch(), origin, "production", { env: { ...env, ANALYTICS_SHEETS_WRITE_ENABLED: "false" }, fetcher })).rejects.toThrow("unavailable");
    expect(fetcher).not.toHaveBeenCalled();
    for (const body of [{ ok: false, code: "busy", retryable: true }, { ok: true, accepted: 0, duplicates: 0, rejected: [] }, { ok: true, accepted: 1, duplicates: 0, rejected: [{ index: 0 }] }, { ok: true, accepted: 2, duplicates: 0, rejected: [] }, { ok: true, accepted: 1, duplicates: 0 }]) {
      fetcher.mockResolvedValue(new Response(JSON.stringify(body)));
      await expect(ingestSheetBatch(batch(), origin, "production", { env, fetcher })).rejects.toThrow("unavailable");
    }
    fetcher.mockResolvedValue(new Response("not json"));
    await expect(ingestSheetBatch(batch(), origin, "production", { env, fetcher })).rejects.toThrow("unavailable");
  });
});
