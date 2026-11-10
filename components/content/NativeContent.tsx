import { createElement, type ReactNode } from "react";
import { nativeTags, type NativeNode } from "@/lib/content/types";

const allowedTags = new Set<string>(nativeTags);
const voidTags = new Set(["img", "br", "source"]);
export interface NativeContentProps {
  node: NativeNode;
  renderOverride?: (node: NativeNode) => ReactNode | undefined;
}

export function nativeAnalyticsTarget(node: NativeNode): string | undefined {
  if (node.attrs?.["data-analytics-target"] !== undefined) return String(node.attrs["data-analytics-target"]);
  if (node.tag !== "a") return undefined;
  const href = String(node.attrs?.href ?? "");
  if (node.attrs?.download || /resume|\.pdf(?:$|[?#])/i.test(href)) return "resume-download";
  if (href.startsWith("mailto:")) return "contact-email";
  if (href === "/") return "nav-home";
  if (href === "/about") return "nav-about";
  const project = /^\/projects\/([a-z0-9-]+)(?:$|[?#])/.exec(href);
  if (project) return `project-${project[1]}`.slice(0, 100);
  if (/^https?:\/\//.test(href)) {
    try { return `external-${new URL(href).hostname.replace(/[^a-z0-9-]/g, "-")}`.slice(0, 100); } catch { return undefined; }
  }
  return undefined;
}

export function NativeContent({ node, renderOverride }: NativeContentProps): ReactNode {
  const replacement = renderOverride?.(node);
  if (replacement !== undefined) return replacement;
  if (!allowedTags.has(node.tag)) throw new Error(`Unsupported native content tag: ${node.tag}`);
  const props = { ...node.attrs, "data-analytics-target": nativeAnalyticsTarget(node), ...(node.tag === "video" && node.attrs?.muted && node.attrs?.loop ? { autoPlay: true, preload: "metadata" } : {}), style: node.style };
  if (voidTags.has(node.tag)) return createElement(node.tag, props);
  return createElement(
    node.tag,
    props,
    node.children?.map((child, index) => typeof child === "string" ? child : <NativeContent key={index} node={child} renderOverride={renderOverride} />),
  );
}
