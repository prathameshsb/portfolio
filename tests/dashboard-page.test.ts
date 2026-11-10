import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OwnerAccessResult } from "../lib/owner-access/core";
const mocks = vi.hoisted(() => ({
  headers: vi.fn<() => Promise<Headers>>(),
  authorize: vi.fn<(request: Request) => Promise<OwnerAccessResult>>(),
}));
vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("../lib/owner-access", () => ({ authorizeOwnerRequest: mocks.authorize }));
vi.mock("../components/analytics/Dashboard", () => ({ default: () => "dashboard" }));
vi.mock("../app/owner/OwnerLogin", () => ({ default: () => "login" }));
import OwnerPage from "../app/owner/page";
import Dashboard from "../components/analytics/Dashboard";
import OwnerLogin from "../app/owner/OwnerLogin";
beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv("OWNER_ORIGIN", "https://portfolio-test.netlify.app");
  mocks.headers.mockResolvedValue(new Headers({ host: "portfolio-test.netlify.app", cookie: "synthetic-cookie" }));
  mocks.authorize.mockResolvedValue({ status: "denied", reason: "session", httpStatus: 401 });
});

describe("fixed owner page", () => {
  it("renders login without owner configuration", async () => {
    vi.stubEnv("OWNER_ORIGIN", "");
    expect((await OwnerPage()).type).toBe(OwnerLogin);
    expect(mocks.authorize).not.toHaveBeenCalled();
  });
  it("never renders data for alternate observed hosts", async () => {
    mocks.headers.mockResolvedValue(new Headers({ host: "preview--portfolio-test.netlify.app" }));
    expect((await OwnerPage()).type).toBe(OwnerLogin);
    expect(mocks.authorize).not.toHaveBeenCalled();
  });
  it("renders login when the session is denied", async () => {
    expect((await OwnerPage()).type).toBe(OwnerLogin);
    expect(mocks.authorize).toHaveBeenCalledOnce();
  });
  it("uses the fixed path, awaited headers and pinned origin", async () => {
    mocks.authorize.mockResolvedValue({ status: "authorized", identity: { subject: "owner", csrfToken: "synthetic", expiresAt: "2026-11-10T20:00:00Z" } });
    expect((await OwnerPage()).type).toBe(Dashboard);
    expect(mocks.authorize.mock.calls[0][0].url).toBe("https://portfolio-test.netlify.app/owner");
    expect(mocks.authorize.mock.calls[0][0].headers.get("cookie")).toBe("synthetic-cookie");
  });
});
