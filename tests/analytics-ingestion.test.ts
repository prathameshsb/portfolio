import { describe, expect, it, vi } from "vitest";
import { ingestRequest } from "../lib/analytics/ingestion";
import { TrackerWriteInvalid } from "../lib/analytics/sheets-ingestion";
const origin = "https://portfolio.example";
const now = new Date("2026-11-10T14:00:00Z");
const env = { NODE_ENV: "production" as const, NETLIFY: "true", CONTEXT: "deploy-preview", ANALYTICS_ALLOWED_ORIGINS: origin, GOOGLE_TRACKER_SHEET_ID: "fixture_sheet_identifier_123456789" };
const event = { eventId: "11111111-1111-4111-8111-111111111111", sessionId: "22222222-2222-4222-8222-222222222222", type: "page_view", occurredAt: now.toISOString(), route: "/", appVersion: "1.0.0", contentVersion: "fixture" };
const request = (body: unknown = { schemaVersion: 2, events: [event] }, headers: Record<string, string> = {}) => new Request(`${origin}/api/events`, { method: "POST", headers: { origin, "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
describe("Sheets-only public ingestion", () => {
  it("requires a trusted native code path on deployed runtimes, ignoring forged browser headers", async () => {
    const write = vi.fn();
    const response = await ingestRequest(request(undefined, { "x-platform-rate-limited": "true" }), { write, env, now });
    expect(response.status).toBe(403); expect(write).not.toHaveBeenCalled();
    const localProduction = await ingestRequest(request(), { write, env: { ...env, NETLIFY: "false" }, now });
    expect(localProduction.status).toBe(403);
  });
  it("returns only the existing writer's confirmed acknowledgments and server-derived context", async () => {
    const write = vi.fn().mockResolvedValue({ accepted: [event.eventId], duplicates: [], ignored: [] });
    const response = await ingestRequest(request(), { write, env, now, platformRateLimited: true });
    expect(response.status).toBe(200); expect(await response.json()).toEqual({ accepted: [event.eventId], duplicates: [], ignored: [] });
    expect(write.mock.calls[0][1]).toBe(origin); expect(write.mock.calls[0][2]).toBe("preview");
    expect(response.headers.get("cache-control")).toContain("no-store");
  });
  it("does not acknowledge unavailable writes, missing source config or invalid cumulative values", async () => {
    const write = vi.fn().mockRejectedValue(new Error("private endpoint must not leak"));
    const dependencies = { write, env, now, platformRateLimited: true };
    const response = await ingestRequest(request(), dependencies);
    expect(response.status).toBe(503); expect(await response.text()).not.toContain("endpoint");
    write.mockRejectedValue(new TrackerWriteInvalid());
    expect((await ingestRequest(request(), dependencies)).status).toBe(400);
    write.mockClear();
    expect((await ingestRequest(request(), { ...dependencies, env: { ...env, GOOGLE_TRACKER_SHEET_ID: "" } })).status).toBe(503);
    expect(write).not.toHaveBeenCalled();
  });
  it("denies invalid origins/bodies and respects privacy signals without writing", async () => {
    const write = vi.fn(), dependencies = { write, env, now, platformRateLimited: true };
    expect((await ingestRequest(request(undefined, { origin: "https://attacker.example" }), dependencies)).status).toBe(403);
    expect((await ingestRequest(request(undefined, { "content-length": "65537" }), dependencies)).status).toBe(413);
    expect((await ingestRequest(request({ padding: "x".repeat(65537) }), dependencies)).status).toBe(413);
    expect((await ingestRequest(request({ schemaVersion: 2, events: [{ ...event, rawIp: "forbidden" }] }), dependencies)).status).toBe(400);
    const response = await ingestRequest(request(undefined, { "sec-gpc": "1" }), dependencies);
    expect(response.status).toBe(200); expect(await response.json()).toMatchObject({ optedOut: true, accepted: [] }); expect(write).not.toHaveBeenCalled();
  });
  it("keeps the local development transport usable without claiming native production protection", async () => {
    const write = vi.fn().mockResolvedValue({ accepted: [], duplicates: [], ignored: [event.eventId] });
    const response = await ingestRequest(request(), { write, env: { ...env, NETLIFY: "false", NODE_ENV: "development" }, now });
    expect(response.status).toBe(200); expect(await response.json()).toHaveProperty("ignored", [event.eventId]);
  });
});
