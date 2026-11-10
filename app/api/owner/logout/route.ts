import { handleOwnerLogout } from "../../../../lib/owner-access/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
function handler(request: Request) { return handleOwnerLogout(request, { environment: () => process.env }); }
export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const DELETE = handler;
export const PATCH = handler;
export const OPTIONS = handler;
export const HEAD = handler;
