/* eslint-disable @next/next/no-css-tags -- Captured styles are scoped to each case-study root. */
import { createElement } from "react";
import type { Project } from "@/lib/content/types";
import { NativeContent } from "@/components/content/NativeContent";
import { SectionRenderer } from "./SectionRenderer";

export function CaseStudy({ project }: { project: Project }) {
  return <>
    <link rel="stylesheet" href={`/styles/${project.slug}.css`} precedence="portfolio-source" />
    <link rel="stylesheet" href="/styles/case-interactions.css" precedence="portfolio-interactions" />
    {createElement(project.root.tag, { ...project.root.attrs, style: project.root.style, "data-project-id": project.slug },
      project.sections.map((section) => <SectionRenderer key={section.id} section={section} />),
      project.definitions ? <NativeContent node={project.definitions} /> : null,
    )}
  </>;
}
