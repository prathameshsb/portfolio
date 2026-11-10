import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OwnerAccessResult } from "../lib/owner-access/core";

const mocks = vi.hoisted(() => ({
  authorize: vi.fn<() => Promise<OwnerAccessResult>>(),
  report: vi.fn(),
  exportEvents: vi.fn(),
}));

vi.mock("../lib/owner-access", async (importOriginal) => {
  const original = await importOriginal<typeof import("../lib/owner-access")>();
  return { ...original, authorizeOwnerRequest: mocks.authorize };
});
vi.mock("../lib/analytics/queries", async (importOriginal) => {
  const original = await importOriginal<typeof import("../lib/analytics/queries")>();
  return { ...original, getAnalyticsReport: mocks.report, exportAnalyticsEvents: mocks.exportEvents };
});

import { GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS } from "../app/api/owner/[action]/route";

const query = "from=2026-11-01T00%3A00%3A00.000Z&to=2026-11-11T00%3A00%3A00.000Z&environment=production&traffic=visitor";
const authorized: OwnerAccessResult = {
  status: "authorized",
  identity: { subject: "owner", csrfToken: "synthetic", expiresAt: "2026-11-10T20:00:00Z" },
};
const context = (action: string) => ({ params: Promise.resolve({ action }) });

beforeEach(() => {
  vi.resetAllMocks();
  mocks.authorize.mockResolvedValue({ status: "denied", reason: "session", httpStatus: 403 });
});

describe("private analytics endpoints", () => {
  it.each(["report", "export", "unknown"])("denies %s without querying storage", async (action) => {
    const response = await GET(new Request(`https://site.netlify.app/api/owner/${action}?${query}`), context(action));
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "Access denied." });
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("netlify-cdn-cache-control")).toBe("no-store");
    expect(mocks.report).not.toHaveBeenCalled();
    expect(mocks.exportEvents).not.toHaveBeenCalled();
  });

  it("uses exactly the validated applied filters for report and export", async () => {
    mocks.authorize.mockResolvedValue(authorized);
    mocks.report.mockResolvedValue({ summary: { events: 1 } });
    mocks.exportEvents.mockResolvedValue({ events: [{ event_id: "synthetic-test-event" }], truncated: false });
    const reportResponse = await GET(new Request(`https://site.netlify.app/api/owner/report?${query}&project=nexa`), context("report"));
    const exportResponse = await GET(new Request(`https://site.netlify.app/api/owner/export?${query}&project=nexa`), context("export"));
    expect(reportResponse.status).toBe(200);
    expect(exportResponse.status).toBe(200);
    expect(mocks.report.mock.calls[0][0]).toEqual(mocks.exportEvents.mock.calls[0][0]);
    expect(mocks.report.mock.calls[0][0]).toMatchObject({ project: "nexa", traffic: "visitor", environment: "production" });
    expect(exportResponse.headers.get("content-disposition")).toMatch(/^attachment; filename="portfolio-events-\d{4}-\d{2}-\d{2}\.json"$/);
    expect(exportResponse.headers.get("x-export-truncated")).toBe("false");
    expect(reportResponse.headers.get("cdn-cache-control")).toBe("no-store");
  });

  it.each([
    `${query}&traffic=all`,
    `${query}&unexpected=private`,
    "from=2026-11-10T00%3A00%3A00.000Z&to=2026-11-01T00%3A00%3A00.000Z",
    `${query}&source=invalid%20source`,
    `${query}&project=unknown-project`,
  ])("rejects ambiguous, unknown or invalid filters without a query", async (invalid) => {
    mocks.authorize.mockResolvedValue(authorized);
    const response = await GET(new Request(`https://site.netlify.app/api/owner/report?${invalid}`), context("report"));
    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(mocks.report).not.toHaveBeenCalled();
  });

  it("does not expose backend errors or connection credentials", async () => {
    mocks.authorize.mockResolvedValue(authorized);
    mocks.report.mockRejectedValue(new Error("postgres://private-user:private-password@private-host/db"));
    const response = await GET(new Request(`https://site.netlify.app/api/owner/report?${query}`), context("report"));
    expect(response.status).toBe(503);
    expect(await response.text()).toBe('{"error":"Analytics is unavailable. Retry shortly."}');
    expect(response.headers.get("netlify-cdn-cache-control")).toBe("no-store");
  });

  it("labels a capped export explicitly", async () => {
    mocks.authorize.mockResolvedValue(authorized);
    mocks.exportEvents.mockResolvedValue({ events: [], truncated: true });
    const response = await GET(new Request(`https://site.netlify.app/api/owner/export?${query}`), context("export"));
    expect(response.headers.get("x-export-truncated")).toBe("true");
    expect(await response.json()).toMatchObject({ truncated: true, events: [] });
  });

  it("keeps unknown authenticated actions closed", async () => {
    mocks.authorize.mockResolvedValue(authorized);
    const response = await GET(new Request(`https://site.netlify.app/api/owner/admin?${query}`), context("admin"));
    expect(response.status).toBe(404);
    expect(mocks.report).not.toHaveBeenCalled();
    expect(mocks.exportEvents).not.toHaveBeenCalled();
  });

  it.each([
    ["HEAD", HEAD], ["POST", POST], ["PUT", PUT], ["PATCH", PATCH],
    ["DELETE", DELETE], ["OPTIONS", OPTIONS],
  ] as const)("independently authorizes and denies unsupported %s", async (method, handler) => {
    const denied = await handler(new Request("https://site.netlify.app/api/owner/report", { method }));
    expect(denied.status).toBe(403);
    expect(mocks.authorize).toHaveBeenCalledOnce();
    mocks.authorize.mockResolvedValue(authorized);
    const unsupported = await handler(new Request("https://site.netlify.app/api/owner/report", { method }));
    expect(unsupported.status).toBe(405);
    expect(unsupported.headers.get("cache-control")).toContain("no-store");
    expect(mocks.report).not.toHaveBeenCalled();
  });
});
