import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { CaseStudy } from "@/components/case-study/CaseStudy";
import { getProject, projects } from "@/data/projects";

export function generateStaticParams() { return projects.map(({ slug }) => ({ slug })); }
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const project = getProject((await params).slug);
  return { title: project ? `${project.title} | Prathamesh S B.` : "Project not found", description: project?.summary };
}
export default async function ProjectPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (slug === "interaction-motion") permanentRedirect("/");
  const project = getProject(slug);
  if (!project) notFound();
  return <CaseStudy project={project} />;
}
