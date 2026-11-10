"use client";

import { useId, useState, type ReactNode } from "react";
import { NativeContent } from "@/components/content/NativeContent";
import type { NativeNode, NativeStyle } from "@/lib/content/types";

const implementation: Array<NativeNode | string> = [
  { tag: "p", children: ["I translated the approved experience into reusable React and TypeScript patterns, using"] },
  { tag: "ul", children: ["pagination,", "debouncing,", "lazy-loading,", "& virtualization"].map((text) => ({ tag: "li", children: [{ tag: "p", children: [text] }] })) },
  { tag: "p", children: ["to address large-value selection and client-side performance constraints."] },
];

function withTabAppearance(node: NativeNode, active: boolean): NativeNode {
  const style: NativeStyle = { ...node.style };
  if (node.tag === "p") {
    style["--framer-text-color"] = active ? "rgb(255, 255, 255)" : "rgb(161, 161, 161)";
    style["--framer-font-weight"] = active ? 700 : 500;
  }
  if (String(node.attrs?.["data-framer-name"]).includes("Indicator")) style.backgroundColor = active ? "rgb(255, 255, 255)" : "rgba(255, 255, 255, 0)";
  return { ...node, style, children: node.children?.map((child) => typeof child === "string" ? child : withTabAppearance(child, active)) };
}

function panelContent(node: NativeNode): NativeNode {
  return {
    ...node,
    children: implementation.map((child) => {
      if (typeof child === "string") return child;
      const paragraphs = (n: NativeNode): NativeNode => ({
        ...n,
        attrs: { ...n.attrs, className: "framer-text" },
        style: n.tag === "p" || n.tag === "ul" ? {
          "--framer-font-family": '"Inconsolata", "Inconsolata Placeholder", monospace',
          "--framer-font-size": "24px",
          "--framer-line-height": "1.3em",
          "--framer-text-alignment": "left",
          "--framer-text-color": "rgb(255, 255, 255)",
        } : n.style,
        children: n.children?.map((nested) => typeof nested === "string" ? nested : paragraphs(nested)),
      });
      return paragraphs(child);
    }),
  };
}

export function OwnershipTabs({ node }: { node: NativeNode }) {
  const [selected, setSelected] = useState(0);
  const id = useId();
  function override(current: NativeNode): ReactNode | undefined {
    const name = String(current.attrs?.["data-framer-name"] ?? "");
    if (current.tag === "button" && (name === "Product Design Tab" || name === "Implementation Tab")) {
      const index = name === "Product Design Tab" ? 0 : 1;
      const styled = withTabAppearance(current, selected === index);
      return <button
        {...current.attrs}
        data-analytics-target={index === 0 ? "ownership-design" : "ownership-build"}
        type="button"
        style={current.style}
        id={`${id}-tab-${index}`}
        role="tab"
        aria-selected={selected === index}
        aria-controls={`${id}-panel`}
        tabIndex={selected === index ? 0 : -1}
        onClick={() => setSelected(index)}
        onKeyDown={(event) => {
          if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
          event.preventDefault();
          const next = event.key === "Home" ? 0 : event.key === "End" ? 1 : 1 - selected;
          setSelected(next);
          event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
        }}
      >{styled.children?.map((child, index) => typeof child === "string" ? child : <NativeContent key={index} node={child} />)}</button>;
    }
    if (name === "Product Design Ownership") {
      const panel = selected === 0 ? current : panelContent(current);
      return <div {...current.attrs} style={current.style} id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-tab-${selected}`}>
        {panel.children?.map((child, index) => typeof child === "string" ? child : <NativeContent key={index} node={child} />)}
      </div>;
    }
    if (name === "Ownership Tabs" && current !== node && current.children?.some((child) => typeof child !== "string" && child.tag === "button")) {
      return <div {...current.attrs} style={current.style} role="tablist" aria-label="Project ownership">
        {current.children.map((child, index) => typeof child === "string" ? child : <NativeContent key={index} node={child} renderOverride={override} />)}
      </div>;
    }
    return undefined;
  }
  return <NativeContent node={node} renderOverride={override} />;
}
