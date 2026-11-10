// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import BreakdownChart from "../components/analytics/BreakdownChart";
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
});
