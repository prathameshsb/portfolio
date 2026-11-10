import { ingestRequest } from "../../../lib/analytics/ingestion";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function POST(request: Request): Promise<Response> | Response {
  if (process.env.NODE_ENV === 'production' || process.env.NETLIFY === 'true') {
    return Response.json({ error: 'Collection unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
  return ingestRequest(request);
}
export function GET(): Response {
  return Response.json({ error: "Method not allowed" }, { status: 405, headers: { Allow: "POST", "Cache-Control": "no-store" } });
}
