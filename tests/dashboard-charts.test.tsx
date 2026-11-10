// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import BreakdownChart from "../components/analytics/BreakdownChart";
import ActivityChart from "../components/analytics/ActivityChart";
import SourceChart from "../components/analytics/SourceChart";
import type { Breakdown } from "../lib/analytics/queries";

const row = (label: string, events: number): Breakdown => ({ label, events, sessions: 1, pageViews: 0, clicks: 0, activeMs: 0, maxScroll: 0 });
afterEach(cleanup);
describe("report breakdown rankings", () => {
  it("ranks actual aggregate counts without mutating report data", () => {
    const rows = [row("source-b", 5), row("source-a", 10), row("source-c", 5)];
    const { container } = render(<BreakdownChart title="Top sources" rows={rows} />);
    const labels = [...container.querySelectorAll("li")].map((item) => item.textContent);
    expect(labels).toEqual(["source-a10", "source-b5", "source-c5"]);
    expect(rows.map((item) => item.label)).toEqual(["source-b", "source-a", "source-c"]);
    const bars = [...container.querySelectorAll("svg rect:last-child")];
    expect(bars.map((bar) => bar.getAttribute("width"))).toEqual(["100", "50", "50"]);
    expect(screen.getByText(/independent of the journey display cap/)).toBeTruthy();
  });
  it("shows directly readable labels and limits the ranking to five groups", () => {
    const { container } = render(<BreakdownChart title="Top pages" rows={Array.from({ length: 7 }, (_, index) => row(`/page-${index}`, 7 - index))} />);
    expect(container.querySelectorAll("li")).toHaveLength(5);
    expect(screen.getByText("/page-0")).toBeTruthy();
    expect(screen.getByText("7")).toBeTruthy();
    expect(screen.queryByText("/page-6")).toBeNull();
    expect([...container.querySelectorAll("svg")].every((svg) => svg.getAttribute("aria-hidden") === "true")).toBe(true);
  });
  it("does not fabricate bars for empty or invalid event counts", () => {
    const { container } = render(<BreakdownChart title="Top projects" rows={[row("zero", 0), row("invalid", Number.NaN)]} />);
    expect(screen.getByText("No matching events to chart.")).toBeTruthy();
    expect(container.querySelectorAll("svg")).toHaveLength(0);
  });
  it("ranks by the displayed metric instead of overall events", () => {
    const rows = [{ ...row("more-events", 50), pageViews: 2 }, { ...row("more-views", 10), pageViews: 8 }];
    const { container } = render(<BreakdownChart title="Popular pages" rows={rows} metric="pageViews" tone="violet" />);
    expect([...container.querySelectorAll("li")].map((item) => item.textContent)).toEqual(["more-views8", "more-events2"]);
    expect([...container.querySelectorAll("svg rect:last-child")].map((bar) => bar.getAttribute("width"))).toEqual(["100", "25"]);
    expect(screen.getByText("Page views · top 2 groups")).toBeTruthy();
  });
  it("keeps original labels available when showing friendlier names", () => {
    render(<BreakdownChart title="Top pages" rows={[row("/projects/nexa", 4)]} formatLabel={() => "Nexa"} />);
    expect(screen.getByTitle("/projects/nexa").textContent).toContain("Nexa");
    expect(screen.getByText("(/projects/nexa)")).toBeTruthy();
  });
});

describe("daily activity graph", () => {
  it("sorts complete daily aggregates, preserves zeros and exposes exact values", () => {
    const days = [{ date: "2026-11-03", pageViews: 4, clicks: 2, events: 12 }, { date: "2026-11-01", pageViews: 8, clicks: 5, events: 30 }, { date: "2026-11-02", pageViews: 0, clicks: 0, events: 0 }];
    const { container } = render(<ActivityChart days={days} />);
    expect(screen.getByRole("img").getAttribute("aria-label")).toContain("12 page views and 7 clicks");
    const dates = [...container.querySelectorAll("tbody th")].map((cell) => cell.textContent);
    expect(dates).toEqual(["2026-11-01", "2026-11-02", "2026-11-03"]);
    expect(days[0].date).toBe("2026-11-03");
    expect(screen.getByText("View daily values").closest("details")?.open).toBe(false);
    expect([...container.querySelectorAll("polyline")].every((line) => !/NaN|Infinity/.test(line.getAttribute("points") || ""))).toBe(true);
  });
  it("distinguishes unavailable daily data from recorded zero activity", () => {
    const { rerender, container } = render(<ActivityChart />);
    expect(screen.getByText(/Daily activity is unavailable/)).toBeTruthy();
    expect(container.querySelector("svg")).toBeNull();
    rerender(<ActivityChart days={[{ date: "2026-11-01", pageViews: 0, clicks: 0, events: 0 }]} />);
    expect(screen.getByText("No page views or clicks were recorded in this window.")).toBeTruthy();
    expect(container.querySelector("circle")).toBeTruthy();
  });
  it.each([
    [{ date: "2026-02-31", pageViews: 1, clicks: 1, events: 2 }],
    [{ date: "2026-11-01", pageViews: Number.NaN, clicks: 1, events: 2 }],
    [{ date: "2026-11-01", pageViews: -1, clicks: 1, events: 2 }],
    [{ date: "2026-11-01", pageViews: 1, clicks: 1, events: 2 }, { date: "2026-11-01", pageViews: 2, clicks: 2, events: 4 }],
  ].map((days) => ({ days })))("does not draw corrupted or duplicate daily data", ({ days }) => {
    const { container } = render(<ActivityChart days={days} />);
    expect(screen.getByText(/Daily activity is unavailable/)).toBeTruthy();
    expect(container.querySelector("svg")).toBeNull();
  });
});

describe("source event composition", () => {
  it("uses the report total as the denominator and accounts for omitted groups", () => {
    const { container } = render(<SourceChart rows={[row("resume", 40), row("linkedin", 20), row("direct", 10), row("email", 5), row("fifth", 5)]} totalEvents={100} />);
    const legend = [...container.querySelectorAll("li")].map((item) => item.textContent);
    expect(legend).toEqual(["resume4040.0%", "linkedin2020.0%", "direct1010.0%", "email55.0%", "Other sources2525.0%"]);
    expect(container.querySelectorAll("circle")).toHaveLength(6);
    const lengths = [...container.querySelectorAll("circle[stroke-dasharray]")].map((circle) => Number(circle.getAttribute("stroke-dasharray")?.split(" ")[0]));
    expect(lengths.reduce((sum, value) => sum + value, 0)).toBeCloseTo(2 * Math.PI * 68);
  });
  it("combines repeated source labels before ranking", () => {
    const { container } = render(<SourceChart rows={[row("resume", 1), row("resume", 2)]} totalEvents={3} />);
    expect([...container.querySelectorAll("li")].map((item) => item.textContent)).toEqual(["resume3100.0%"]);
  });
  it.each([
    { rows: [row("oversized", 11)], total: 10 },
    { rows: [row("invalid", Number.NaN)], total: 10 },
    { rows: [row("negative", -1)], total: 10 },
    { rows: [], total: Number.POSITIVE_INFINITY },
  ])("does not draw an unreconciled source composition", ({ rows, total }) => {
    const { container } = render(<SourceChart rows={rows} totalEvents={total} />);
    expect(screen.getByText(/Source counts could not be reconciled/)).toBeTruthy();
    expect(container.querySelector("svg")).toBeNull();
  });
  it("shows an empty state instead of a filled zero-traffic ring", () => {
    const { container } = render(<SourceChart rows={[]} totalEvents={0} />);
    expect(screen.getByText("No matching events to chart.")).toBeTruthy();
    expect(container.querySelector("svg")).toBeNull();
  });
});
