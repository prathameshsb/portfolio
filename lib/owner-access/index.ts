import "server-only";
import { createOwnerAuthorizer } from "./core";
import { ownerAdapterRequest } from "./next-request";
import type { OwnerAccessResult } from "./core";
export { ownerAccessDenied, privateResponseHeaders, type OwnerAccessResult, type VerifiedOwnerIdentity } from "./core";
const authorize = createOwnerAuthorizer({ environment: () => process.env, now: () => Date.now() });
export async function authorizeOwnerRequest(request: Request): Promise<OwnerAccessResult> {
  const normalized = ownerAdapterRequest(request, process.env);
  return normalized ? authorize(normalized) : { status: "denied", reason: "origin", httpStatus: 403 };
}
