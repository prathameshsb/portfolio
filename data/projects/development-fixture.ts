import type { NativeNode, Project } from "@/lib/content/types";

const paragraph = (text: string): NativeNode => ({ tag: "p", children: [text] });
export const developmentFixture: Project = {
  slug: "development-fixture",
  title: "Case-study renderer fixture",
  summary: "Development-only content proving that a new case uses the existing renderer.",
  related: "/projects/findem-query-insights-hub",
  root: { tag: "div", attrs: { className: "development-case-fixture" } },
  sections: [
    { kind: "hero", id: "fixture-hero", label: "Development fixture", node: { tag: "section", children: [{ tag: "h1", children: ["Development fixture"] }, paragraph("This deterministic page is excluded from production and analytics.")] } },
    { kind: "metadata", id: "fixture-metadata", label: "Metadata", node: { tag: "section", children: [paragraph("Status: renderer verification only"), paragraph("Role: no project or career claim")] } },
    { kind: "narrative", id: "fixture-narrative", label: "Shared content", node: { tag: "section", children: [{ tag: "h2", children: ["A new case, the same renderer"] }, paragraph("This page is defined by a typed data record without a copied route or layout component.")] } },
    { kind: "related", id: "fixture-related", label: "Read next", node: { tag: "a", attrs: { href: "/projects/findem-query-insights-hub" }, children: ["Query Insights Hub"] } },
  ],
};
