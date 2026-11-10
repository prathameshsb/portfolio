import { handleOwnerLogout } from "../../../../lib/owner-access/http";
import { ownerAdapterRequest } from "../../../../lib/owner-access/next-request";
import { privateResponseHeaders } from "../../../../lib/owner-access/core";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
function handler(request: Request) {
  const normalized = ownerAdapterRequest(request, process.env);
  return normalized ? handleOwnerLogout(normalized, { environment: () => process.env }) : Response.json({ error: "Access denied." }, { status: 403, headers: privateResponseHeaders });
}
export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const DELETE = handler;
export const PATCH = handler;
export const OPTIONS = handler;
export const HEAD = handler;
