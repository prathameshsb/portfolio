import { createHmac } from "node:crypto";
import {
  CSRF_SECONDS, SESSION_SECONDS, cookieHeader, cookieName, createOwnerAuthorizer,
  issueLoginCsrf, issueSession, ownerConfig, privateResponseHeaders, readSession,
  requestCookie, sameOwnerOrigin, verifyLoginCsrf, verifyOwnerPassword,
  type OwnerEnvironment,
} from "./core";

export type OwnerHttpOptions = {
  environment: () => OwnerEnvironment;
  now?: () => number;
  platformRateLimited?: boolean;
  clientIp?: string;
};
const attempts = new Map<string, { count: number; until: number }>();
function response(error: string, status: number): Response {
  return Response.json({ error }, { status, headers: privateResponseHeaders });
}
function localAttemptAllowed(key: string, now: number): boolean {
  for (const [entry, bucket] of attempts) if (bucket.until <= now) attempts.delete(entry);
  const current = attempts.get(key);
  if (!current) {
    if (attempts.size >= 1024) return false;
    attempts.set(key, { count: 1, until: now + 300_000 });
    return true;
  }
  current.count++;
  return current.count <= 5;
}
async function loginBody(request: Request): Promise<{ password: string; csrfToken: string } | undefined> {
  if (!/^application\/json(?:;\s*charset=utf-8)?$/i.test(request.headers.get("content-type") || "")) return undefined;
  const length = request.headers.get("content-length");
  if (length && (!/^\d+$/.test(length) || Number(length) > 4096)) return undefined;
  const reader = request.body?.getReader();
  if (!reader) return undefined;
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const part = await reader.read(); if (part.done) break;
      size += part.value.byteLength;
      if (size > 4096) { await reader.cancel(); return undefined; }
      chunks.push(part.value);
    }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    const value: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
    const data = value as Record<string, unknown>;
    if (Object.keys(data).sort().join(",") !== "csrfToken,password" || typeof data.password !== "string" || typeof data.csrfToken !== "string" ||
      Buffer.byteLength(data.password, "utf8") > 1024 || data.csrfToken.length > 2048) return undefined;
    return { password: data.password, csrfToken: data.csrfToken };
  } catch { return undefined; }
  finally { reader.releaseLock(); }
}

/** Native Netlify wrapper supplies the platform flag and context.ip, never a request header. */
export async function handleOwnerLogin(request: Request, options: OwnerHttpOptions): Promise<Response> {
  try {
    const environment = options.environment();
    const config = ownerConfig(environment);
    const now = options.now?.() ?? Date.now();
    if (!config) return response("Owner login is not configured.", 503);
    if (!sameOwnerOrigin(request, config, request.method === "POST")) return response("Access denied.", 403);
    // The Next adapter endpoint cannot issue sessions on Netlify. Only the native
    // function, protected by the platform rate rule, supplies this code-level flag.
    if (config.productionNetlify && (!options.platformRateLimited || !options.clientIp)) return response("Owner login is unavailable.", 503);
    if (request.method === "GET") {
      const session = readSession(config, requestCookie(request, cookieName(config, "session")), now);
      if (session) return Response.json({ csrfToken: session.csrfToken, authenticated: true }, { headers: privateResponseHeaders });
      const csrfToken = issueLoginCsrf(config, now);
      return Response.json({ csrfToken, authenticated: false }, { headers: { ...privateResponseHeaders, "Set-Cookie": cookieHeader(config, "csrf", csrfToken, CSRF_SECONDS) } });
    }
    if (request.method !== "POST") return response("Method not allowed.", 405);
    const body = await loginBody(request);
    if (!body) return response("Invalid login request.", 400);
    if (!verifyLoginCsrf(config, requestCookie(request, cookieName(config, "csrf")), body.csrfToken, now)) return response("Refresh the login form and try again.", 403);
    const bucketKey = createHmac("sha256", Buffer.from(config.secret, "hex")).update(options.clientIp || "local-development").digest("hex");
    // Defense in depth only: this process-local limit does not replace Netlify's
    // distributed limit on the native production login function.
    if (!localAttemptAllowed(bucketKey, now)) return Response.json({ error: "Too many attempts. Try again in five minutes." }, { status: 429, headers: { ...privateResponseHeaders, "Retry-After": "300" } });
    if (!await verifyOwnerPassword(body.password, config.passwordHash)) return response("Password not recognized.", 401);
    const headers = new Headers(privateResponseHeaders);
    headers.append("Set-Cookie", cookieHeader(config, "session", issueSession(config, now), SESSION_SECONDS));
    headers.append("Set-Cookie", cookieHeader(config, "csrf", "", 0));
    return Response.json({ ok: true }, { headers });
  } catch { return response("Owner login is unavailable. Retry shortly.", 503); }
}

export async function handleOwnerLogout(request: Request, options: Pick<OwnerHttpOptions, "environment" | "now">): Promise<Response> {
  try {
    if (request.method !== "POST") return response("Method not allowed.", 405);
    const authorize = createOwnerAuthorizer({ environment: options.environment, now: options.now || (() => Date.now()) });
    const result = await authorize(request);
    if (result.status === "denied") return response("Access denied.", result.httpStatus);
    const config = ownerConfig(options.environment());
    if (!config) return response("Access denied.", 503);
    const headers = new Headers(privateResponseHeaders);
    headers.append("Set-Cookie", cookieHeader(config, "session", "", 0));
    headers.append("Set-Cookie", cookieHeader(config, "csrf", "", 0));
    return Response.json({ ok: true }, { headers });
  } catch { return response("Access denied.", 503); }
}
