import { z } from "zod";

export const PUBLIC_ROUTES = ["/", "/about", "/projects/findem-query-insights-hub", "/projects/nexa", "/projects/nexa-design-system", "/projects/gryphon-sales-analytics", "/projects/findem-checkout-flow", "/projects/findem-password-validator", "/projects/flexrent", "/projects/snapkart", "/projects/incluvie"] as const;
export const PROJECT_IDS = PUBLIC_ROUTES.filter((route) => route.startsWith("/projects/")).map((route) => route.slice(10));
export const EVENT_TYPES = ["page_view", "page_exit", "click", "scroll", "engagement"] as const;
export const ENVIRONMENTS = ["production", "preview", "development"] as const;
export type AnalyticsEnvironment = typeof ENVIRONMENTS[number];
export type TrafficKind = "visitor" | "test" | "owner";

const token = z.string().min(1).max(80).regex(/^[a-zA-Z0-9._~-]+$/);
const attribution = z.object({ source: token.optional(), medium: token.optional(), campaign: token.optional(), recipientToken: token.max(64).optional() }).strict();
const semanticId = z.string().min(1).max(100).regex(/^[a-z0-9]+(?:[.:-][a-z0-9]+)*$/);
export const AnalyticsEventSchema = z.object({
  eventId: z.uuid(), sessionId: z.uuid(), type: z.enum(EVENT_TYPES),
  occurredAt: z.iso.datetime({ offset: false }),
  route: z.enum(PUBLIC_ROUTES), targetId: semanticId.optional(),
  projectId: z.string().refine((value) => PROJECT_IDS.includes(value), "Unknown project").optional(),
  scrollDepth: z.union([z.literal(25), z.literal(50), z.literal(75), z.literal(90), z.literal(100)]).optional(),
  activeMs: z.number().int().min(1).max(60_000).optional(),
  totalActiveMs: z.number().int().min(1).max(21_600_000).optional(),
  attribution: attribution.optional(), appVersion: token, contentVersion: token,
  traffic: z.enum(["visitor", "test", "owner"]).default("visitor"),
}).strict().superRefine((event, ctx) => {
  const issue = (message: string) => ctx.addIssue({ code: "custom", message });
  if (event.type === "click" && !event.targetId) issue("Click requires a semantic target");
  if (event.type === "scroll" && event.scrollDepth === undefined) issue("Scroll requires depth");
  if (event.type === "engagement" && event.activeMs === undefined) issue("Engagement requires active time");
  if (event.type === "engagement" && event.totalActiveMs === undefined) issue("Cumulative active time is required for engagement");
  if (event.activeMs !== undefined && event.totalActiveMs !== undefined && event.activeMs > event.totalActiveMs) issue("Cumulative active time cannot be smaller than its interval");
  if (event.type !== "engagement" && event.totalActiveMs !== undefined) issue("Cumulative active time belongs to engagement events");
  if (event.type !== "engagement" && event.activeMs !== undefined) issue("Active time belongs to engagement events");
  if (event.type !== "scroll" && event.scrollDepth !== undefined) issue("Depth belongs to scroll events");
  if (event.projectId && event.route !== `/projects/${event.projectId}`) issue("Project must match route");
});
export const AnalyticsBatchSchema = z.object({ schemaVersion: z.literal(2), events: z.array(AnalyticsEventSchema).min(1).max(20) }).strict().superRefine((batch, ctx) => {
  if (new Set(batch.events.map((event) => event.eventId)).size !== batch.events.length) ctx.addIssue({ code: "custom", message: "Duplicate event IDs in batch" });
});
export type EventInput = z.infer<typeof AnalyticsEventSchema>;
export type AnalyticsBatch = z.infer<typeof AnalyticsBatchSchema>;
export interface StoredEvent extends Omit<EventInput, "eventId" | "sessionId" | "type" | "scrollDepth"> {
  sourceReceivedAt?: string; legacyActiveMs?: number; scrollDepth?: number; eventId: string; sessionId: string; type: typeof EVENT_TYPES[number] | "session_qualified" | "form_submit";
  origin: string; environment: AnalyticsEnvironment; schemaVersion: 1 | 2;
  provenance: "browser-v2" | "legacy-import";
}
export function batchWithinTimeWindow(batch: AnalyticsBatch, now = Date.now()): boolean {
  return batch.events.every((event) => {
    const timestamp = Date.parse(event.occurredAt);
    return timestamp <= now + 5 * 60_000 && timestamp >= now - 24 * 60 * 60_000;
  });
}
