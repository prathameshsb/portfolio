"use client";

import { useRef, useState, type ReactNode } from "react";
import { NativeContent } from "@/components/content/NativeContent";
import { visitNativeNodes, type NativeNode } from "@/lib/content/types";

function listIn(node: NativeNode): NativeNode | undefined {
  let result: NativeNode | undefined;
  visitNativeNodes(node, (candidate) => { if (!result && candidate.tag === "ul") result = candidate; });
  return result;
}

export function Gallery({ node, analyticsId }: { node: NativeNode; analyticsId: string }) {
  const galleryId = analyticsId.replace(/[^a-zA-Z0-9-]/g, "-").slice(0, 75);
  const [selected, setSelected] = useState(0);
  const pointerX = useRef<number | null>(null);
  const list = listIn(node);
  const slides = list?.children?.filter((child): child is NativeNode => typeof child !== "string") ?? [];
  const count = slides.length;
  function select(index: number) { if (count) setSelected((index + count) % count); }
  function override(current: NativeNode): ReactNode | undefined {
    if (current === list) {
      return <ul {...list.attrs} style={{ ...list.style, transform: `translateX(calc(-${selected * 100}% - ${selected * 10}px))`, transition: "transform 400ms cubic-bezier(.22,1,.36,1)", touchAction: "pan-y" }}>
        {slides.map((slide, index) => <NativeContent key={index} node={slide} />)}
      </ul>;
    }
    if (current.tag === "button") {
      const label = String(current.attrs?.["aria-label"] ?? "");
      const dot = /^Scroll to page (\d+)$/.exec(label);
      if (label !== "Previous" && label !== "Next" && !dot) return undefined;
      const target = dot ? Number(dot[1]) - 1 : selected + (label === "Previous" ? -1 : 1);
      return <button {...current.attrs} type="button" disabled={count < 2} style={{ ...current.style, cursor: count < 2 ? "default" : "pointer", pointerEvents: count < 2 ? "none" : "auto" }}
        aria-current={dot && target === selected ? "true" : undefined}
        data-analytics-target={dot ? `${galleryId}-slide-${target + 1}` : `${galleryId}-${label.toLowerCase()}`}
        onClick={() => select(target)}
      >{current.children?.map((child, index) => typeof child === "string" ? child : <NativeContent key={index} node={dot ? { ...child, style: { ...child.style, opacity: target === selected ? 1 : .5 } } : child} />)}</button>;
    }
    return undefined;
  }
  if (!count) return null;
  return <section {...node.attrs} style={node.style} aria-roledescription="carousel" aria-label="Case study image gallery" tabIndex={0}
    onKeyDown={(event) => {
      if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
        event.preventDefault();
        select(event.key === "Home" ? 0 : event.key === "End" ? count - 1 : selected + (event.key === "ArrowLeft" ? -1 : 1));
      }
    }}
    onDragStart={(event) => event.preventDefault()}
    onPointerDown={(event) => { pointerX.current = event.clientX; }}
    onPointerCancel={() => { pointerX.current = null; }}
    onPointerUp={(event) => {
      if (pointerX.current !== null && Math.abs(event.clientX - pointerX.current) > 40) select(selected + (event.clientX < pointerX.current ? 1 : -1));
      pointerX.current = null;
    }}
  >
    {node.children?.map((child, index) => typeof child === "string" ? child : <NativeContent key={index} node={child} renderOverride={override} />)}
    <span className="content-visually-hidden" aria-live="polite">Slide {selected + 1} of {count}</span>
  </section>;
}
