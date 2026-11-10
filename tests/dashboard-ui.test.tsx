// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { AnalyticsReport } from "../lib/analytics/queries";
import Dashboard, { dashboardFilterQuery } from "../components/analytics/Dashboard";

function report(overrides: Partial<AnalyticsReport> = {}): AnalyticsReport {
  return {
    filters: { from: "2026-11-01T00:00:00.000Z", to: "2026-11-11T00:00:00.000Z", environment: "production", traffic: "visitor" },
    summary: { events: 0, sessions: 0, pageViews: 0, clicks: 0, activeMs: 0, legacyActiveMs: 0, attributedSessions: 0, freshness: null },
    sources: [], campaigns: [], projects: [], pages: [], targets: [], sessions: [], sessionsTruncated: false,
    generatedAt: "2026-11-10T12:00:00.000Z",
    definitions: { sessions: "Distinct anonymous sessions, not unique people." },
    ...overrides,
  };
}

const fetchMock = vi.fn<typeof fetch>();
beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("owner dashboard states and filters", () => {
  it("shows loading without invented totals", () => {
    fetchMock.mockReturnValue(new Promise(() => undefined));
    render(<Dashboard />);
    expect(screen.getByRole("status").textContent).toContain("Loading analytics");
    expect(screen.queryByText("Recipient-link sessions")).toBeNull();
  });

  it("shows genuine empty traffic and anonymous metric definitions", async () => {
    fetchMock.mockResolvedValue(Response.json(report()));
    render(<Dashboard />);
    expect(await screen.findByText("No traffic in this window")).toBeTruthy();
    expect(screen.getByText("Distinct anonymous sessions, not unique people.")).toBeTruthy();
    expect(screen.getByText(/No received events/)).toBeTruthy();
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ cache: "no-store", credentials: "same-origin" });
  });

  it("distinguishes no matching filters from no recorded traffic", async () => {
    fetchMock.mockResolvedValue(Response.json(report({ filters: { ...report().filters, project: "nexa" } })));
    render(<Dashboard />);
    expect(await screen.findByText("No matching results")).toBeTruthy();
    expect(screen.queryByText("No traffic in this window")).toBeNull();
  });

  it("uses tracked session maxima for Sheets and shows source interpretation gaps", async () => {
    fetchMock.mockResolvedValue(Response.json(report({
      summary: { ...report().summary, activeMs: 1000, legacyActiveMs: 9000 },
      definitions: { partialData: "Some source rows were held safely." },
      sourceMetadata: {
        backend: "google-sheets", fetchedAt: "2026-11-10T12:00:00.000Z", sourceFreshness: null,
        totalRows: 10, heldRows: 2, duplicateRows: 1, warnings: ["Two rows are held; totals are partial."],
      },
    })));
    render(<Dashboard />);
    expect(await screen.findByText("Tracked time")).toBeTruthy();
    expect(screen.getByText("9s")).toBeTruthy();
    expect(screen.queryByText("1s")).toBeNull();
    expect(screen.queryByText("Active time (interval deltas)")).toBeNull();
    expect(screen.getByText(/Historical visible-tab timing can include idle time/)).toBeTruthy();
    expect(screen.getByText(/newer tracking requires focus and recent input/)).toBeTruthy();
    expect(screen.getByText(/Interval active-time deltas are unavailable/)).toBeTruthy();
    expect(screen.getByText("Two rows are held; totals are partial.")).toBeTruthy();
    expect(screen.getAllByText("Some source rows were held safely.").length).toBeGreaterThan(0);
  });

  it.each([401, 403])("clears analytics on expired/denied access (%i)", async (status) => {
    fetchMock.mockResolvedValue(new Response(null, { status }));
    render(<Dashboard />);
    expect(await screen.findByText("Access expired or denied")).toBeTruthy();
    expect(screen.queryByText("Recipient-link sessions")).toBeNull();
  });

  it("omits unavailable interval zeros from Sheets breakdowns and session journeys", async () => {
    const row = { label: "resume", events: 1, sessions: 1, pageViews: 0, clicks: 0, activeMs: 0, maxScroll: 0 };
    fetchMock.mockResolvedValue(Response.json(report({
      summary: { ...report().summary, events: 1, sessions: 1, activeMs: 0, legacyActiveMs: 9000 },
      sources: [row],
      sourceMetadata: { backend: "google-sheets", fetchedAt: "2026-11-10T12:00:00.000Z", sourceFreshness: null, totalRows: 1, heldRows: 0, duplicateRows: 0, warnings: [] },
      sessions: [{
        origin: "legacy:synthetic-test", sessionId: "synthetic-session", firstSeen: "2026-11-10T12:00:00.000Z", lastSeen: "2026-11-10T12:00:00.000Z",
        source: "resume", campaign: null, recipientToken: null, attribution: "anonymous", traffic: "visitor",
        activeMs: 0, legacyActiveMs: 9000, eventsTruncated: false,
        events: [{ eventId: "synthetic-event", type: "engagement", occurredAt: "2026-11-10T12:00:00.000Z", route: "/", projectId: null, targetId: null, activeMs: 0, scrollDepth: null }],
      }],
    })));
    render(<Dashboard />);
    await screen.findByText("Tracked time");
    expect(screen.queryByRole("columnheader", { name: "Active time (interval deltas)" })).toBeNull();
    const details = screen.getByText(/Resume visit ·/).closest("details")!;
    details.open = true;
    fireEvent(details, new Event("toggle"));
    expect(await screen.findByText("Tracked active time (session maximum)")).toBeTruthy();
    expect(screen.getByText(/the filtered maximum may include earlier session activity/)).toBeTruthy();
    expect(screen.queryByText("0s")).toBeNull();
    expect(screen.queryByText("Active time (interval deltas)")).toBeNull();
  });

  it("charts aggregate page views independently of the capped journey sample", async () => {
    const aggregate = { label: "/projects/nexa", events: 201, sessions: 156, pageViews: 100, clicks: 20, activeMs: 0, maxScroll: 75 };
    fetchMock.mockResolvedValue(Response.json(report({
      summary: { ...report().summary, events: 201, sessions: 156 }, pages: [aggregate], sessionsTruncated: true,
    })));
    render(<Dashboard />);
    const chart = await screen.findByRole("figure", { name: /Top pages/ });
    expect(within(chart).getByText("100")).toBeTruthy();
    expect(within(chart).getByTitle("/projects/nexa")).toBeTruthy();
    expect(screen.getByText(/Partial journeys: the view is limited/)).toBeTruthy();
    expect(screen.getByText(/project bars show event counts, not unique people/)).toBeTruthy();
  });

  it("puts aggregate breakdowns before journeys and flags source issues without promising site health", async () => {
    fetchMock.mockResolvedValue(Response.json(report({
      summary: { ...report().summary, events: 1, pageViews: 1 },
      sourceMetadata: { backend: "google-sheets", fetchedAt: "2026-11-10T12:00:00.000Z", sourceFreshness: null, totalRows: 3, heldRows: 1, duplicateRows: 1, warnings: [] },
    })));
    const { container } = render(<Dashboard />);
    await screen.findByText("Review recommended");
    const breakdowns = screen.getByRole("region", { name: "Detailed breakdowns" });
    const journeys = screen.getByRole("region", { name: "Session journeys" });
    expect(breakdowns.compareDocumentPosition(journeys) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText(/does not verify that every visit was captured/)).toBeTruthy();
    expect(screen.getByText("Some data needs a closer look")).toBeTruthy();
    expect(container.querySelectorAll('details[open]')).toHaveLength(0);
    expect(screen.getByText("Daily activity is unavailable for this report. The breakdowns below still show recorded totals.")).toBeTruthy();
  });

  it("applies a quick date window and preserves the selected cohort", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-10T14:00:00.000Z"));
    fetchMock.mockResolvedValue(Response.json(report()));
    render(<Dashboard />);
    await screen.findByText("No traffic in this window");
    fireEvent.change(screen.getByLabelText("Traffic"), { target: { value: "test" } });
    fireEvent.click(screen.getByRole("button", { name: "Last 7 days" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const query = new URL(String(fetchMock.mock.calls[1][0]), "https://test.invalid").searchParams;
    expect(query.get("from")).toBe("2026-11-04T00:00:00.000Z");
    expect(query.get("to")).toBe("2026-11-11T00:00:00.000Z");
    expect(query.get("traffic")).toBe("test");
    vi.useRealTimers();
  });

  it("labels resume visits with their role, location and landing case instead of anonymous identity", async () => {
    fetchMock.mockResolvedValue(Response.json(report({
      summary: { ...report().summary, events: 1, sessions: 1 },
      sessions: [{ origin: "https://synthetic-test.example.com", sessionId: "synthetic-resume-session", firstSeen: "2026-11-10T12:00:00.000Z", lastSeen: "2026-11-10T12:00:00.000Z", source: "resume", campaign: "product-design-new-york", recipientToken: null, attribution: "anonymous", traffic: "visitor", activeMs: 0, legacyActiveMs: 0, eventsTruncated: false, events: [{ eventId: "synthetic-resume-event", type: "page_view", occurredAt: "2026-11-10T12:00:00.000Z", route: "/projects/findem-query-insights-hub", projectId: "findem-query-insights-hub", targetId: null, activeMs: null, scrollDepth: null }] }],
    })));
    render(<Dashboard />);
    const title = await screen.findByText("Resume visit · Product Design · New York");
    expect(screen.queryByText(/^Anonymous session ·/)).toBeNull();
    expect(within(title.closest("summary")!).getByText("Query Insights Hub")).toBeTruthy();
    const details=title.closest("details")!;details.open=true;fireEvent(details,new Event("toggle"));
    expect(await screen.findByText(/identifies the resume link used, not the person/)).toBeTruthy();
  });

  it("preserves edited filters through backend failure and retry", async () => {
    fetchMock.mockResolvedValueOnce(Response.json(report()));
    render(<Dashboard />);
    await screen.findByText("No traffic in this window");
    fireEvent.change(screen.getByLabelText("Source"), { target: { value: "resume" } });
    fireEvent.change(screen.getByLabelText("Traffic"), { target: { value: "all" } });
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 503 }));
    fireEvent.click(screen.getByRole("button", { name: "Apply filters" }));
    await screen.findByText("Analytics unavailable");
    expect((screen.getByLabelText("Source") as HTMLInputElement).value).toBe("resume");
    expect((screen.getByLabelText("Traffic") as HTMLSelectElement).value).toBe("all");
    fetchMock.mockResolvedValueOnce(Response.json(report({ filters: { ...report().filters, traffic: "all", source: "resume" } })));
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await screen.findByText("No matching results");
    const url = String(fetchMock.mock.calls.at(-1)?.[0]);
    expect(url).toContain("source=resume");
    expect(url).toContain("traffic=all");
  });

  it("never exports unsaved filter edits in place of the displayed report", async () => {
    fetchMock.mockResolvedValueOnce(Response.json(report()));
    render(<Dashboard />);
    await screen.findByText("No traffic in this window");
    const appliedQuery = String(fetchMock.mock.calls[0][0]).split("?")[1];
    fireEvent.change(screen.getByLabelText("Source"), { target: { value: "unsaved-edit" } });
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 503 }));
    fireEvent.click(screen.getByRole("button", { name: "Export matching events" }));
    await screen.findByText("Export is unavailable. Retry shortly.");
    expect(fetchMock.mock.calls.at(-1)?.[0]).toBe(`/api/owner/export?${appliedQuery}`);
  });

  it("labels recipient links honestly and lazy-opens partial journeys", async () => {
    fetchMock.mockResolvedValue(Response.json(report({
      summary: { events: 600, sessions: 1, pageViews: 1, clicks: 2, activeMs: 3000, legacyActiveMs: 0, attributedSessions: 1, freshness: "2026-11-10T12:00:00.000Z" },
      sessions: [{
        origin: "https://synthetic-test.example.com", sessionId: "synthetic-session-id", firstSeen: "2026-11-10T12:00:00.000Z", lastSeen: "2026-11-10T12:00:03.000Z", source: "resume", campaign: null,
        recipientToken: "synthetic-link-token", attribution: "recipient-link", traffic: "visitor", activeMs: 3000, legacyActiveMs: 0, eventsTruncated: true,
        events: [{ eventId: "synthetic-event", type: "click", occurredAt: "2026-11-10T12:00:03.000Z", route: "/about", projectId: null, targetId: "nav.about", activeMs: null, scrollDepth: null }],
      }],
    })));
    render(<Dashboard />);
    await screen.findByText(/Resume visit · Unspecified version/);
    expect(screen.getByText(/Partial journeys: the view is limited/)).toBeTruthy();
    expect(screen.queryByText(/synthetic-link-token/)).toBeNull();
    const details = screen.getByText(/Resume visit · Unspecified version/).closest("details")!;
    details.open = true;
    fireEvent(details, new Event("toggle"));
    expect(await screen.findByText(/identifies the issued link, not the person who opened it/)).toBeTruthy();
    expect(screen.getByText("nav.about")).toBeTruthy();
  });

  it("downloads a real capped response with an explicit partial-export notice", async () => {
    const createObjectURL = vi.fn(() => "blob:synthetic-controlled-export");
    const revokeObjectURL = vi.fn();
    class ExportURL extends URL {
      static createObjectURL = createObjectURL;
      static revokeObjectURL = revokeObjectURL;
    }
    vi.stubGlobal("URL", ExportURL);
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    fetchMock.mockResolvedValueOnce(Response.json(report()));
    render(<Dashboard />);
    await screen.findByText("No traffic in this window");
    fetchMock.mockResolvedValueOnce(Response.json({ events: [{ event_id: "synthetic-event" }], truncated: true, filters: report().filters }));
    fireEvent.click(screen.getByRole("button", { name: "Export matching events" }));
    expect(await screen.findByText(/Partial export downloaded: first 10,000 matching events/)).toBeTruthy();
    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(click).toHaveBeenCalledOnce();
    expect(document.querySelector('a[download]')).toBeNull();
  });

  it("recovers from a malformed report response", async () => {
    fetchMock.mockResolvedValue(Response.json({ error: "unexpected response" }));
    render(<Dashboard />);
    expect(await screen.findByText("Analytics unavailable")).toBeTruthy();
    expect(screen.getByText(/response could not be read/)).toBeTruthy();
  });

  it.each([
    { ...report(), summary: { ...report().summary, freshness: "invalid-timestamp" } },
    { ...report(), summary: { ...report().summary, sessions: -1 } },
    { ...report(), sources: [{ label: "incomplete-row" }] },
    { ...report(), sessions: [null] },
  ])("rejects corrupted nested response fields safely", async (body) => {
    fetchMock.mockResolvedValue(Response.json(body));
    render(<Dashboard />);
    expect(await screen.findByText("Analytics unavailable")).toBeTruthy();
    expect(screen.queryByText("Recipient-link sessions")).toBeNull();
  });

  it("converts inclusive UTC dates to an exclusive next-day endpoint", () => {
    const query = new URLSearchParams(dashboardFilterQuery({
      from: "2026-11-01", to: "2026-11-10", environment: "production", traffic: "visitor", source: "", campaign: "", project: "",
    }));
    expect(query.get("from")).toBe("2026-11-01T00:00:00.000Z");
    expect(query.get("to")).toBe("2026-11-11T00:00:00.000Z");
    expect(query.get("traffic")).toBe("visitor");
    expect(query.has("source")).toBe(false);
  });

  it("rejects reversed or overlong ranges before fetching", async () => {
    fetchMock.mockResolvedValue(Response.json(report()));
    render(<Dashboard />);
    await screen.findByText("No traffic in this window");
    fireEvent.change(screen.getByLabelText("From (UTC)"), { target: { value: "2026-11-11" } });
    fireEvent.change(screen.getByLabelText("Through (UTC, inclusive)"), { target: { value: "2026-11-01" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply filters" }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledOnce();
    await waitFor(() => expect(screen.getByText("No traffic in this window")).toBeTruthy());
  });
});
