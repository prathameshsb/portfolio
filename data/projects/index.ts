import checkout from "./findem-checkout-flow.json";
import password from "./findem-password-validator.json";
import query from "./findem-query-insights-hub.json";
import flexrent from "./flexrent.json";
import gryphon from "./gryphon-sales-analytics.json";
import incluvie from "./incluvie.json";
import nexaSystem from "./nexa-design-system.json";
import nexa from "./nexa.json";
import snapkart from "./snapkart.json";
import { developmentFixture } from "./development-fixture";
import { parseProject } from "@/lib/content/types";

export const projects = [query, nexa, nexaSystem, gryphon, checkout, password, flexrent, snapkart, incluvie].map(parseProject);
const bySlug = new Map(projects.map((project) => [project.slug, project]));
export function getProject(slug: string) {
  if (process.env.NODE_ENV === "development" && slug === developmentFixture.slug) return developmentFixture;
  return bySlug.get(slug);
}
