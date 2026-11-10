import { createHash, createHmac, randomBytes, scrypt, timingSafeEqual } from "node:crypto";

export type OwnerEnvironment = Readonly<Record<string, string | undefined>>;
export type OwnerDenialReason = "configuration" | "origin" | "session" | "expired" | "csrf" | "method";
export type VerifiedOwnerIdentity = Readonly<{ subject: "owner"; expiresAt: string; csrfToken: string }>;
export type OwnerAccessResult =
  | { status: "authorized"; identity: VerifiedOwnerIdentity }
  | { status: "denied"; reason: OwnerDenialReason; httpStatus: 401 | 403 | 503 };
export type OwnerConfig = Readonly<{
  origin: string; passwordHash: string; secret: string; secure: boolean; productionNetlify: boolean;
}>;
export const SESSION_SECONDS = 8 * 60 * 60;
export const CSRF_SECONDS = 10 * 60;
export const privateResponseHeaders = Object.freeze({
  "Cache-Control": "private, no-store, max-age=0", "CDN-Cache-Control": "no-store",
  "Netlify-CDN-Cache-Control": "no-store", Pragma: "no-cache", Expires: "0",
  "X-Robots-Tag": "noindex, nofollow, noarchive", Vary: "Cookie, Origin",
  "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer",
});
export function ownerAccessDenied(result: Extract<OwnerAccessResult, { status: "denied" }>): Response {
  return Response.json({ error: "Access denied." }, { status: result.httpStatus, headers: privateResponseHeaders });
}
export function sha256(value: string): string { return createHash("sha256").update(value).digest("hex"); }
function equal(left: string, right: string): boolean {
  const a = Buffer.from(left), b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}
function passwordParts(hash: string): { salt: Buffer; key: Buffer } | undefined {
  const match = /^scrypt\$131072\$8\$1\$([a-f0-9]{32})\$([a-f0-9]{128})$/.exec(hash);
  return match ? { salt: Buffer.from(match[1], "hex"), key: Buffer.from(match[2], "hex") } : undefined;
}
async function derivePassword(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 64, { N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 }, (error, key) => error ? reject(error) : resolve(key));
  });
}
export async function hashOwnerPassword(password: string): Promise<string> {
  if (Buffer.byteLength(password, "utf8") < 10 || Buffer.byteLength(password, "utf8") > 1024) throw new Error("Use a password between 10 and 1024 UTF-8 bytes.");
  const salt = randomBytes(16), key = await derivePassword(password, salt);
  return `scrypt$131072$8$1$${salt.toString("hex")}$${key.toString("hex")}`;
}
export async function verifyOwnerPassword(password: string, hash: string): Promise<boolean> {
  const parts = passwordParts(hash);
  if (!parts || Buffer.byteLength(password, "utf8") > 1024) return false;
  const actual = await derivePassword(password, parts.salt);
  return timingSafeEqual(parts.key, actual);
}
export function ownerConfig(environment: OwnerEnvironment): OwnerConfig | undefined {
  const origin = environment.OWNER_ORIGIN, passwordHash = environment.OWNER_PASSWORD_HASH, secret = environment.OWNER_SESSION_SECRET;
  if (!origin || !passwordHash || !passwordParts(passwordHash) || !secret || !/^[a-f0-9]{64}$/.test(secret)) return undefined;
  try {
    const url = new URL(origin);
    if (origin !== url.origin || url.username || url.password || url.search || url.hash || url.pathname !== "/") return undefined;
    const secure = url.protocol === "https:";
    if (!secure && !(environment.NODE_ENV !== "production" && environment.NETLIFY !== "true" && url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))) return undefined;
    if (environment.NETLIFY === "true" && environment.CONTEXT !== "production") return undefined;
    return { origin, passwordHash, secret, secure, productionNetlify: environment.NETLIFY === "true" || environment.NODE_ENV === "production" };
  } catch { return undefined; }
}
export function cookieName(config: OwnerConfig, purpose: "session" | "csrf"): string {
  return `${config.secure ? "__Host-" : ""}portfolio-owner-${purpose}${config.secure ? "" : "-dev"}`;
}
export function cookieHeader(config: OwnerConfig, purpose: "session" | "csrf", value: string, maxAge: number): string {
  return `${cookieName(config, purpose)}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${config.secure ? "; Secure" : ""}`;
}
export function requestCookie(request: Request, name: string): string | undefined {
  const values = (request.headers.get("cookie") || "").split(";").map((part) => part.trim()).filter((part) => part.startsWith(`${name}=`));
  return values.length === 1 ? values[0].slice(name.length + 1) : undefined;
}
function sign(config: OwnerConfig, value: string): string {
  return createHmac("sha256", Buffer.from(config.secret, "hex")).update(value).digest("base64url");
}
function signedToken(config: OwnerConfig, data: unknown[]): string {
  const payload = Buffer.from(JSON.stringify(data)).toString("base64url");
  return `${payload}.${sign(config, payload)}`;
}
function decodeToken(config: OwnerConfig, token: string | undefined): unknown[] | undefined {
  if (!token || token.length > 2048 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/.test(token)) return undefined;
  const [payload, signature] = token.split(".");
  if (!equal(signature, sign(config, payload))) return undefined;
  try { const data: unknown = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")); return Array.isArray(data) ? data : undefined; } catch { return undefined; }
}
export function issueSession(config: OwnerConfig, now = Date.now()): string {
  const issued = Math.floor(now / 1000);
  return signedToken(config, ["owner-session-v1", issued, issued + SESSION_SECONDS, randomBytes(32).toString("base64url"), sha256(config.passwordHash), randomBytes(32).toString("base64url")]);
}
export function readSession(config: OwnerConfig, token: string | undefined, now = Date.now()): VerifiedOwnerIdentity | undefined {
  const data = decodeToken(config, token);
  if (!data || data.length !== 6) return undefined;
  const [version, issued, expiry, nonce, authVersion, csrfToken] = data;
  const seconds = Math.floor(now / 1000);
  if (version !== "owner-session-v1" || !Number.isSafeInteger(issued) || !Number.isSafeInteger(expiry) ||
    typeof issued !== "number" || typeof expiry !== "number" || issued > seconds + 5 || expiry <= seconds || expiry - issued !== SESSION_SECONDS ||
    typeof nonce !== "string" || !/^[a-zA-Z0-9_-]{43}$/.test(nonce) || authVersion !== sha256(config.passwordHash) ||
    typeof csrfToken !== "string" || !/^[a-zA-Z0-9_-]{43}$/.test(csrfToken)) return undefined;
  return { subject: "owner", expiresAt: new Date(expiry * 1000).toISOString(), csrfToken };
}
export function issueLoginCsrf(config: OwnerConfig, now = Date.now()): string {
  return signedToken(config, ["owner-login-csrf-v1", Math.floor(now / 1000), randomBytes(32).toString("base64url")]);
}
export function verifyLoginCsrf(config: OwnerConfig, cookie: string | undefined, submitted: string, now = Date.now()): boolean {
  if (!cookie || !equal(cookie, submitted)) return false;
  const data = decodeToken(config, submitted);
  if (!data || data.length !== 3) return false;
  const [version, issued, nonce] = data;
  return version === "owner-login-csrf-v1" && typeof issued === "number" && Number.isSafeInteger(issued) &&
    issued <= Math.floor(now / 1000) + 5 && Math.floor(now / 1000) - issued < CSRF_SECONDS &&
    typeof nonce === "string" && /^[A-Za-z0-9_-]{43}$/.test(nonce);
}
export function sameOwnerOrigin(request: Request, config: OwnerConfig, requireOrigin: boolean): boolean {
  const origin = request.headers.get("origin");
  return new URL(request.url).origin === config.origin &&
    (!requireOrigin || origin === config.origin) && (!origin || origin === config.origin) &&
    request.headers.get("sec-fetch-site") !== "cross-site";
}
export function createOwnerAuthorizer(dependencies: { environment: () => OwnerEnvironment; now: () => number }) {
  return async (request: Request): Promise<OwnerAccessResult> => {
    const config = ownerConfig(dependencies.environment());
    if (!config) return { status: "denied", reason: "configuration", httpStatus: 503 };
    if (!sameOwnerOrigin(request, config, !["GET", "HEAD"].includes(request.method))) return { status: "denied", reason: "origin", httpStatus: 403 };
    const identity = readSession(config, requestCookie(request, cookieName(config, "session")), dependencies.now());
    if (!identity) return { status: "denied", reason: "session", httpStatus: 401 };
    if (!["GET", "HEAD"].includes(request.method)) {
      const csrf = request.headers.get("x-owner-csrf");
      if (!csrf || !equal(csrf, identity.csrfToken)) return { status: "denied", reason: "csrf", httpStatus: 403 };
    }
    return { status: "authorized", identity };
  };
}
