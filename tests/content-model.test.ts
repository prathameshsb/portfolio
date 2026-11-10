import { describe, expect, it } from "vitest";
import home from "@/data/home.json";
import about from "@/data/about.json";
import { projects } from "@/data/projects";
import { developmentFixture } from "@/data/projects/development-fixture";
import { assertNativeNode, parseProject, visitNativeNodes, type NativeNode } from "@/lib/content/types";

function nodesIn(root: NativeNode): NativeNode[] {
  const nodes: NativeNode[] = [];
  visitNativeNodes(root, (node) => nodes.push(node));
  return nodes;
}

describe("public content boundary", () => {
  it.each(["script", "iframe", "object", "embed", "unknown"])("rejects unsupported %s nodes", (tag) => {
    expect(() => assertNativeNode({ tag })).toThrow("Unsupported content tag");
  });
  it.each(["javascript:alert(1)", "data:text/html,<script>alert(1)</script>", "//external.example/path"])("rejects executable or ambiguous links", (href) => {
    expect(() => assertNativeNode({ tag: "a", attrs: { href } })).toThrow("Unsupported content URL");
  });
  it("rejects event handlers and HTML injection attributes", () => {
    for (const attrs of [{ onClick: "alert(1)" }, { dangerouslySetInnerHTML: "<script>" }, { srcDoc: "<script>" }]) {
      expect(() => assertNativeNode({ tag: "div", attrs })).toThrow("Unsafe content attribute");
    }
  });
  it("validates every public presentation tree and bundles media locally", () => {
    const roots: unknown[] = [home.root, about.root, ...projects.flatMap((project) => [project.root, ...project.sections.map((section) => section.node), ...(project.definitions ? [project.definitions] : [])])];
    for (const root of roots) {
      assertNativeNode(root);
      for (const node of nodesIn(root)) {
        if (node.attrs?.src) expect(String(node.attrs.src)).toMatch(/^\/assets\//);
        if (node.attrs?.srcSet) expect(String(node.attrs.srcSet)).not.toContain("https://");
        expect(String(node.attrs?.href ?? "")).not.toContain("interaction-motion");
        expect(JSON.stringify(node.style ?? {})).not.toContain("framerusercontent.com");
      }
    }
  });
  it("normalizes nested source anchors into noninteractive spans", () => {
    function check(node: NativeNode, inAnchor = false): void {
      if (inAnchor) expect(node.tag).not.toBe("a");
      for (const child of node.children ?? []) if (typeof child !== "string") check(child, inAnchor || node.tag === "a");
    }
    for (const project of projects) for (const section of project.sections) check(section.node);
  });
  it("routes every read-next variant to the named case", () => {
    const expected: Record<string, string> = {
      "findem-query-insights-hub": "/projects/findem-checkout-flow",
      "findem-checkout-flow": "/projects/gryphon-sales-analytics",
      "gryphon-sales-analytics": "/projects/findem-password-validator",
      "findem-password-validator": "/projects/incluvie",
      incluvie: "/projects/findem-query-insights-hub",
      nexa: "/projects/nexa-design-system",
      "nexa-design-system": "/projects/nexa",
      flexrent: "/",
      snapkart: "/",
    };
    for (const project of projects) {
      expect(project.related).toBe(expected[project.slug]);
      for (const section of project.sections.filter((section) => section.kind === "related")) {
        const links = nodesIn(section.node).filter((node) => node.tag === "a");
        expect(links.length).toBeGreaterThan(0);
        for (const link of links) expect(link.attrs?.href).toBe(expected[project.slug]);
      }
    }
  });
  it("rejects unknown section types and duplicate section IDs", () => {
    const project = projects[0];
    expect(() => parseProject({ ...project, sections: [{ ...project.sections[0], kind: "invented" }] })).toThrow("Unknown project section kind");
    expect(() => parseProject({ ...project, sections: [project.sections[0], project.sections[0]] })).toThrow("Project section IDs must be unique");
  });
  it("supports another data-only case through the same schema", () => {
    expect(parseProject(developmentFixture)).toBe(developmentFixture);
    expect(projects.some((project) => project.slug === developmentFixture.slug)).toBe(false);
  });
});
