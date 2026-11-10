import type { CSSProperties } from "react";

export const nativeTags = [
  "div", "p", "a", "img", "li", "h1", "h2", "h3", "h4", "h5", "h6", "svg", "br", "use", "ul", "ol", "span", "button", "strong", "em", "b", "i", "video", "source", "canvas", "path", "section", "fieldset", "rect", "nav", "g", "defs", "circle", "line", "polyline", "polygon", "linearGradient", "radialGradient", "stop", "clipPath", "mask", "ellipse", "text",
] as const;
export type NativeTag = (typeof nativeTags)[number];
export type NativeStyle = CSSProperties & Record<string, string | number | undefined>;
export interface NativeNode {
  tag: NativeTag;
  attrs?: Record<string, string | number | boolean>;
  style?: NativeStyle;
  children?: Array<NativeNode | string>;
}
export interface NativePage { root: NativeNode }
export const sectionKinds = ["hero", "metadata", "narrative", "media", "grid", "tabs", "gallery", "related", "header", "footer"] as const;
export type ProjectSection = {
  [Kind in (typeof sectionKinds)[number]]: { kind: Kind; id: string; label: string; node: NativeNode }
}[(typeof sectionKinds)[number]];
export interface Project {
  slug: string;
  title: string;
  summary: string;
  related: string;
  root: NativeNode;
  sections: ProjectSection[];
  definitions?: NativeNode | null;
}

const tags = new Set<string>(nativeTags);
const kinds = new Set<string>(sectionKinds);
const blockedAttributes = /^(?:on|dangerouslySetInnerHTML$|srcDoc$|innerHTML$)/i;
const urlAttributes = new Set(["href", "src", "poster", "xlinkHref"]);
const unsafeStyle = /javascript\s*:|expression\s*\(|@import/i;

export function assertNativeNode(value: unknown): asserts value is NativeNode {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Content node must be an object");
  const node = value as Record<string, unknown>;
  if (typeof node.tag !== "string" || !tags.has(node.tag)) throw new Error(`Unsupported content tag: ${String(node.tag)}`);
  if (node.attrs !== undefined) {
    if (!node.attrs || typeof node.attrs !== "object" || Array.isArray(node.attrs)) throw new Error("Invalid content attributes");
    for (const [name, attr] of Object.entries(node.attrs)) {
      if (blockedAttributes.test(name) || !["string", "number", "boolean"].includes(typeof attr)) throw new Error(`Unsafe content attribute: ${name}`);
      if (urlAttributes.has(name) && typeof attr === "string" && !/^(?:\/(?!\/)|#|https?:\/\/|mailto:)/i.test(attr)) throw new Error(`Unsupported content URL in ${name}`);
    }
  }
  if (node.style !== undefined) {
    if (!node.style || typeof node.style !== "object" || Array.isArray(node.style)) throw new Error("Invalid content style");
    for (const value of Object.values(node.style)) {
      if (!["string", "number"].includes(typeof value) || unsafeStyle.test(String(value))) throw new Error("Unsafe content style");
    }
  }
  if (node.children !== undefined) {
    if (!Array.isArray(node.children)) throw new Error("Invalid content children");
    for (const child of node.children) if (typeof child !== "string") assertNativeNode(child);
  }
}

export function parseProject(value: unknown): Project {
  if (!value || typeof value !== "object") throw new Error("Project must be an object");
  const project = value as Record<string, unknown>;
  for (const field of ["slug", "title", "summary", "related"]) {
    if (typeof project[field] !== "string" || !project[field]) throw new Error(`Missing project ${field}`);
  }
  if (!/^\/[a-z0-9/-]*$/.test(String(project.related))) throw new Error("Invalid related project route");
  assertNativeNode(project.root);
  if (!Array.isArray(project.sections)) throw new Error("Project sections are required");
  const ids = new Set<string>();
  for (const section of project.sections) {
    if (!section || typeof section !== "object" || !kinds.has(section.kind)) throw new Error("Unknown project section kind");
    if (typeof section.id !== "string" || !section.id || ids.has(section.id)) throw new Error("Project section IDs must be unique");
    ids.add(section.id);
    if (typeof section.label !== "string") throw new Error("Project section label is required");
    assertNativeNode(section.node);
  }
  if (project.definitions) assertNativeNode(project.definitions);
  return project as unknown as Project;
}

export function visitNativeNodes(node: NativeNode, visitor: (node: NativeNode) => void): void {
  visitor(node);
  for (const child of node.children ?? []) if (typeof child !== "string") visitNativeNodes(child, visitor);
}
