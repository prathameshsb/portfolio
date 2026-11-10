import "server-only";
import { createOwnerAuthorizer } from "./core";
export { ownerAccessDenied, privateResponseHeaders, type OwnerAccessResult, type VerifiedOwnerIdentity } from "./core";
export const authorizeOwnerRequest = createOwnerAuthorizer({ environment: () => process.env, now: () => Date.now() });
