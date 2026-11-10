import {
  authorizeOwnerRequest,
  ownerAccessDenied,
  privateResponseHeaders,
} from "../../../../lib/owner-access";
import {
  exportAnalyticsEvents,
  getAnalyticsReport,
  REPORT_DEFINITIONS,
  ReportFiltersSchema,
} from "../../../../lib/analytics/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ action: string }> };

function response(error: string, status: number) {
  return Response.json({ error }, { status, headers: privateResponseHeaders });
}

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  try {
    const access = await authorizeOwnerRequest(request);
    if (access.status === "denied") return ownerAccessDenied(access);
    if (request.method !== "GET") return response("Method not allowed.", 405);
    const { action } = await context.params;
    if (action !== "report" && action !== "export") return response("Not found.", 404);

    const search = new URL(request.url).searchParams;
    if ([...search.keys()].some((key) => search.getAll(key).length !== 1)) {
      return response("Each filter must have a single value.", 400);
    }
    const filters = ReportFiltersSchema.safeParse(Object.fromEntries(search));
    if (!filters.success) return response("Choose valid UTC filters and a range up to 366 days.", 400);

    if (action === "report") {
      return Response.json(await getAnalyticsReport(filters.data), { headers: privateResponseHeaders });
    }
    const exported = await exportAnalyticsEvents(filters.data);
    const generatedAt = new Date().toISOString();
    return Response.json({ ...exported, generatedAt, definitions: REPORT_DEFINITIONS }, {
      headers: {
        ...privateResponseHeaders,
        "Content-Disposition": `attachment; filename="portfolio-events-${generatedAt.slice(0, 10)}.json"`,
        "X-Export-Truncated": String(exported.truncated),
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return response("Analytics is unavailable. Retry shortly.", 503);
  }
}

async function rejectMethod(request: Request): Promise<Response> {
  try {
    const access = await authorizeOwnerRequest(request);
    if (access.status === "denied") return ownerAccessDenied(access);
    return response("Method not allowed.", 405);
  } catch {
    return response("Access denied.", 503);
  }
}

export const HEAD = rejectMethod;
export const POST = rejectMethod;
export const PUT = rejectMethod;
export const PATCH = rejectMethod;
export const DELETE = rejectMethod;
export const OPTIONS = rejectMethod;
