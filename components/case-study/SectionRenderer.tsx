import type { ReactNode } from "react";
import { NativeContent } from "@/components/content/NativeContent";
import { OwnershipTabs } from "./OwnershipTabs";
import { Gallery } from "./Gallery";
import { ReadNext, SocialLinks } from "./ReadNext";
import type { NativeNode, ProjectSection } from "@/lib/content/types";

function interactiveModule(node: NativeNode, sectionId: string): ReactNode | undefined {
  if (node.attrs?.["data-framer-name"] === "Social Links") return <SocialLinks node={node} />;
  if (node.attrs?.["data-content-module"] === "ownership-tabs") return <OwnershipTabs node={node} />;
  if (node.attrs?.["data-content-module"] === "gallery") return <Gallery node={node} analyticsId={sectionId} />;
  return undefined;
}

export function SectionRenderer({ section }: { section: ProjectSection }) {
  switch (section.kind) {
    case "related":
      return <ReadNext node={{ ...section.node, attrs: { ...section.node.attrs, "data-section-id": section.id, "data-section-kind": section.kind } }} />;
    case "hero": case "metadata": case "narrative": case "media": case "grid":
    case "tabs": case "gallery": case "header": case "footer":
      return <NativeContent node={{ ...section.node, attrs: { ...section.node.attrs, "data-section-id": section.id, "data-section-kind": section.kind } }} renderOverride={node => interactiveModule(node, section.id)} />;
    default: {
      const never: never = section;
      throw new Error(`Unsupported project section: ${String(never)}`);
    }
  }
}
