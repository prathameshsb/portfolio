import { z } from "zod";
import { ENVIRONMENTS, PROJECT_IDS } from "./schema";

const filterToken = z.string().max(80).regex(/^[a-zA-Z0-9._~-]+$/);
export const ReportFiltersSchema = z.object({
  from: z.iso.datetime(), to: z.iso.datetime(),
  environment: z.enum(ENVIRONMENTS).default("production"),
  traffic: z.enum(["visitor", "test", "owner", "all"]).default("visitor"),
  source: filterToken.optional(), campaign: filterToken.optional(),
  project: z.string().refine((value) => PROJECT_IDS.includes(value)).optional(),
}).strict().superRefine((value, ctx) => {
  const span = Date.parse(value.to) - Date.parse(value.from);
  if (span <= 0 || span > 366 * 86_400_000) ctx.addIssue({ code: "custom", message: "Choose a positive range up to 366 days" });
});
export type ReportFilters = z.infer<typeof ReportFiltersSchema>;
export interface ReportSummary { events: number; sessions: number; pageViews: number; clicks: number; activeMs: number; legacyActiveMs: number; attributedSessions: number; freshness: string | null }
export interface Breakdown { label: string; events: number; sessions: number; pageViews: number; clicks: number; activeMs: number; maxScroll: number }
export interface DailyActivity { date: string; pageViews: number; clicks: number; events: number }
export interface JourneyEvent { eventId: string; type: string; occurredAt: string; route: string; projectId: string | null; targetId: string | null; activeMs: number | null; scrollDepth: number | null }
export interface SessionJourney { origin: string; sessionId: string; firstSeen: string; lastSeen: string; source: string | null; campaign: string | null; recipientToken: string | null; attribution: "recipient-link" | "anonymous"; traffic: string; activeMs: number; legacyActiveMs: number; events: JourneyEvent[]; eventsTruncated: boolean }
export interface AnalyticsReport { filters: ReportFilters; summary: ReportSummary; dailyActivity?: DailyActivity[]; sources: Breakdown[]; campaigns: Breakdown[]; projects: Breakdown[]; pages: Breakdown[]; targets: Breakdown[]; sessions: SessionJourney[]; sessionsTruncated: boolean; generatedAt: string; definitions: Record<string, string>; sourceMetadata?: { backend: "google-sheets"; fetchedAt: string; sourceFreshness: string | null; totalRows: number; heldRows: number; duplicateRows: number; warnings: string[] } }
export const REPORT_DEFINITIONS = {
  sessions: "Distinct origin + anonymous session ID within the selected event window; not unique people.",
  activeMs: "Visible, focused time while input was observed in the previous 30 seconds, reported in bounded deltas by client v2. Legacy time is reported separately as observed session maxima and can include idle time.",
  legacyActiveMs: "Historical cumulative active-time values are preserved separately. This metric sums each session’s largest observed historical value, matching the old tracker; a filtered window may include earlier activity within those sessions. It is not a sum of event deltas or proof of attention.",
  attribution: "Recipient-link means a coded link was used; it does not establish who personally opened it.",
  traffic: "Visitor is the default cohort. Owner/test labels are exclusion hints, not authenticated identities. Blocked or opted-out visits are absent.",
  freshness: "Newest storage receipt in the selected cohort; importing historical events updates this time without proving the live collector is healthy.",
  scope: "Filters select matching events, so a journey can be partial. Times are UTC; the end time is exclusive. Dashboard journeys are capped at 100 sessions and 500 events per session; export is capped at 10000 matching events.",
};
export async function getAnalyticsReport(input: unknown): Promise<AnalyticsReport> {
  const filters = ReportFiltersSchema.parse(input);
  const [{ fetchTrackerSheet }, { sheetAnalyticsReport }] = await Promise.all([import("./sheets"), import("./sheet-report")]);
  return sheetAnalyticsReport(await fetchTrackerSheet(), filters);
}
export async function exportAnalyticsEvents(input: unknown): Promise<{ events: Record<string, unknown>[]; truncated: boolean; filters: ReportFilters }> {
  const filters = ReportFiltersSchema.parse(input);
  const [{ fetchTrackerSheet }, { sheetAnalyticsExport }] = await Promise.all([import("./sheets"), import("./sheet-report")]);
  return sheetAnalyticsExport(await fetchTrackerSheet(), filters);
}
