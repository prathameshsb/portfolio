import { beforeAll, describe, expect, it } from "vitest";
import {
  SESSION_SECONDS, CSRF_SECONDS, cookieHeader, cookieName, createOwnerAuthorizer,
  hashOwnerPassword, issueLoginCsrf, issueSession, ownerAccessDenied, ownerConfig,
  readSession, requestCookie, verifyLoginCsrf, verifyOwnerPassword,
  type OwnerConfig, type OwnerEnvironment,
} from "../lib/owner-access/core";
import { handleOwnerLogin, handleOwnerLogout } from "../lib/owner-access/http";

const now = Date.UTC(2026, 10, 10, 12);
const origin = "https://portfolio-test.netlify.app";
const password = "synthetic-test-password-only";
const secret = "b".repeat(64); // Test material, never a deployment credential.
let passwordHash: string;
let keyNumber = 0;
beforeAll(async () => { passwordHash = await hashOwnerPassword(password); });
function env(overrides: OwnerEnvironment = {}): OwnerEnvironment {
  return { NODE_ENV: "test", OWNER_ORIGIN: origin, OWNER_PASSWORD_HASH: passwordHash, OWNER_SESSION_SECRET: secret, ...overrides };
}
function config(overrides: OwnerEnvironment = {}): OwnerConfig {
  const value = ownerConfig(env(overrides));
  if (!value) throw new Error("Invalid synthetic test configuration");
  return value;
}
function authorizer(overrides: OwnerEnvironment = {}, currentTime = now) {
  return createOwnerAuthorizer({ environment: () => env(overrides), now: () => currentTime });
}
function sessionRequest(options: { method?: string; target?: string; token?: string; csrf?: string; origin?: string; cookie?: string } = {}) {
  const settings = config();
  const token = options.token ?? issueSession(settings, now);
  const headers: Record<string, string> = { cookie: options.cookie ?? `${cookieName(settings, "session")}=${token}` };
  if (options.origin !== undefined) headers.origin = options.origin;
  if (options.csrf !== undefined) headers["x-owner-csrf"] = options.csrf;
  return new Request(options.target ?? `${origin}/api/owner/report`, { method: options.method ?? "GET", headers });
}
function loginRequest(options: { password?: string; csrf?: string; cookieCsrf?: string; origin?: string; contentType?: string; body?: string; method?: string } = {}) {
  const settings = config();
  const csrf = options.csrf ?? issueLoginCsrf(settings, now);
  return new Request(`${origin}/api/owner/login`, {
    method: options.method ?? "POST",
    headers: {
      origin: options.origin ?? origin,
      "content-type": options.contentType ?? "application/json",
      cookie: `${cookieName(settings, "csrf")}=${options.cookieCsrf ?? csrf}`,
    },
    body: options.body ?? JSON.stringify({ password: options.password ?? password, csrfToken: csrf }),
  });
}
function httpOptions(overrides: OwnerEnvironment = {}) {
  return { environment: () => env(overrides), now: () => now, clientIp: `synthetic-${++keyNumber}` };
}

describe("single-owner signed sessions", () => {
  it("uses a salted memory-hard scrypt hash and checks the actual password", async () => {
    expect(passwordHash).toMatch(/^scrypt\$131072\$8\$1\$[a-f0-9]{32}\$[a-f0-9]{128}$/);
    expect(await verifyOwnerPassword(password, passwordHash)).toBe(true);
    expect(await verifyOwnerPassword("incorrect", passwordHash)).toBe(false);
  });
  it("refuses weak setup input and unsupported hash cost parameters", async () => {
    await expect(hashOwnerPassword("short")).rejects.toThrow();
    expect(ownerConfig(env({ OWNER_PASSWORD_HASH: passwordHash.replace("131072", "999999999") }))).toBeUndefined();
    expect(await verifyOwnerPassword(password, passwordHash.replace("131072", "999999999"))).toBe(false);
  });
  it.each([
    { OWNER_PASSWORD_HASH: undefined }, { OWNER_SESSION_SECRET: undefined },
    { OWNER_SESSION_SECRET: "weak" }, { OWNER_ORIGIN: undefined },
    { OWNER_ORIGIN: "https://portfolio-test.netlify.app/" },
    { OWNER_ORIGIN: "http://untrusted.example.com" },
    { NETLIFY: "true", CONTEXT: "deploy-preview" },
  ])("denies incomplete/unsafe configuration: %o", async (overrides) => {
    expect(await authorizer(overrides)(sessionRequest())).toMatchObject({ status: "denied", reason: "configuration" });
  });
  it("authorizes a signed session and exposes no password/hash in its payload", async () => {
    const token = issueSession(config(), now);
    const payload = Buffer.from(token.split(".")[0], "base64url").toString("utf8");
    expect(payload).not.toContain(password);
    expect(payload).not.toContain(passwordHash);
    expect(await authorizer()(sessionRequest({ token }))).toMatchObject({ status: "authorized", identity: { subject: "owner" } });
  });
  it("denies anonymous and duplicate-cookie requests", async () => {
    expect(await authorizer()(new Request(`${origin}/api/owner/export`))).toMatchObject({ status: "denied", httpStatus: 401 });
    const token = issueSession(config(), now), name = cookieName(config(), "session");
    expect(await authorizer()(sessionRequest({ cookie: `${name}=${token}; ${name}=${token}` }))).toMatchObject({ status: "denied" });
  });
  it("rejects tampering, expired sessions and future-issued sessions", async () => {
    const token = issueSession(config(), now);
    expect(await authorizer()(sessionRequest({ token: `a${token.slice(1)}` }))).toMatchObject({ status: "denied" });
    expect(await authorizer({}, now + SESSION_SECONDS * 1000)(sessionRequest({ token }))).toMatchObject({ status: "denied" });
    expect(await authorizer({}, now - 6000)(sessionRequest({ token }))).toMatchObject({ status: "denied" });
  });
  it("revokes all sessions after password-hash or signing-secret rotation", async () => {
    const token = issueSession(config(), now);
    const rotatedHash = `${passwordHash.slice(0, -1)}${passwordHash.endsWith("0") ? "1" : "0"}`;
    expect(await authorizer({ OWNER_PASSWORD_HASH: rotatedHash })(sessionRequest({ token }))).toMatchObject({ status: "denied" });
    expect(await authorizer({ OWNER_SESSION_SECRET: "c".repeat(64) })(sessionRequest({ token }))).toMatchObject({ status: "denied" });
  });
  it.each([
    "https://preview--portfolio-test.netlify.app", "https://attacker.example.com", "http://portfolio-test.netlify.app",
  ])("rejects alternate origins even with a copied valid cookie: %s", async (target) => {
    expect(await authorizer()(sessionRequest({ target: `${target}/api/owner/report` }))).toMatchObject({ status: "denied", reason: "origin" });
  });
  it("requires exact same Origin and session CSRF for mutations", async () => {
    const token = issueSession(config(), now), session = readSession(config(), token, now)!;
    expect(await authorizer()(sessionRequest({ method: "POST", token }))).toMatchObject({ status: "denied", reason: "origin" });
    expect(await authorizer()(sessionRequest({ method: "POST", token, origin, csrf: "forged" }))).toMatchObject({ status: "denied", reason: "csrf" });
    expect(await authorizer()(sessionRequest({ method: "POST", token, origin, csrf: session.csrfToken }))).toMatchObject({ status: "authorized" });
  });
  it("uses host-only secure HttpOnly cookies in production and distinct dev cookies locally", () => {
    const production = cookieHeader(config(), "session", "synthetic", SESSION_SECONDS);
    expect(production).toContain("__Host-portfolio-owner-session=");
    for (const required of ["HttpOnly", "Secure", "SameSite=Strict", "Path=/", "Max-Age=28800"]) expect(production).toContain(required);
    expect(production).not.toContain("Domain=");
    const development = config({ OWNER_ORIGIN: "http://127.0.0.1:3000", NODE_ENV: "development" });
    expect(cookieHeader(development, "session", "synthetic", SESSION_SECONDS)).toContain("portfolio-owner-session-dev=");
    expect(ownerConfig(env({ OWNER_ORIGIN: "http://127.0.0.1:3000", NODE_ENV: "production" }))).toBeUndefined();
  });
  it("uses signed short-lived double-submit login CSRF", () => {
    const settings = config(), csrf = issueLoginCsrf(settings, now);
    expect(verifyLoginCsrf(settings, csrf, csrf, now)).toBe(true);
    expect(verifyLoginCsrf(settings, csrf, csrf, now + CSRF_SECONDS * 1000)).toBe(false);
    expect(verifyLoginCsrf(settings, undefined, csrf, now)).toBe(false);
    expect(verifyLoginCsrf(settings, `${csrf}x`, csrf, now)).toBe(false);
  });
  it("returns generic no-store denial", async () => {
    const response = ownerAccessDenied({ status: "denied", reason: "configuration", httpStatus: 503 });
    expect(await response.json()).toEqual({ error: "Access denied." });
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("cdn-cache-control")).toBe("no-store");
    expect(response.headers.get("netlify-cdn-cache-control")).toBe("no-store");
  });
});

describe("owner login/logout HTTP boundary", () => {
  it("issues a login CSRF cookie without exposing analytics or credentials", async () => {
    const response = await handleOwnerLogin(new Request(`${origin}/api/owner/login`), httpOptions());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ authenticated: false });
    expect(response.headers.get("set-cookie")).toContain("__Host-portfolio-owner-csrf=");
    expect(response.headers.get("cache-control")).toContain("no-store");
  });
  it("performs actual password login and issues an eight-hour session", async () => {
    const response = await handleOwnerLogin(loginRequest(), httpOptions());
    expect(response.status).toBe(200);
    const cookies = response.headers.getSetCookie();
    expect(cookies.some((cookie) => cookie.includes("Max-Age=28800"))).toBe(true);
    expect(cookies.some((cookie) => cookie.includes("portfolio-owner-csrf=;"))).toBe(true);
    const sessionCookie = cookies.find((cookie) => cookie.startsWith(cookieName(config(), "session")))!;
    const token = sessionCookie.split(";")[0].split("=")[1];
    expect(readSession(config(), token, now)?.subject).toBe("owner");
    expect(await response.json()).toEqual({ ok: true });
  });
  it.each([
    { NODE_ENV: "production", NETLIFY: undefined },
    { NODE_ENV: "production", NETLIFY: "true", CONTEXT: "production" },
  ])("prevents the Next adapter login route bypassing native limits: %o", async (overrides) => {
    const response = await handleOwnerLogin(loginRequest(), httpOptions(overrides));
    expect(response.status).toBe(503);
    expect(response.headers.get("set-cookie")).toBeNull();
  });
  it("requires trusted native context IP with the platform code flag", async () => {
    const options = { ...httpOptions({ NODE_ENV: "production", NETLIFY: "true", CONTEXT: "production" }), platformRateLimited: true, clientIp: undefined };
    expect((await handleOwnerLogin(loginRequest(), options)).status).toBe(503);
    expect((await handleOwnerLogin(loginRequest(), { ...options, clientIp: "trusted-native-test-ip" })).status).toBe(200);
  });
  it.each([
    { password: "incorrect" }, { origin: "https://attacker.example.com" },
    { csrf: "forged-csrf", cookieCsrf: "forged-csrf" },
    { contentType: "text/plain" }, { body: "not-json" },
    { body: JSON.stringify({ password, csrfToken: "x", unexpected: "field" }) },
    { body: "x".repeat(4097) },
  ])("rejects wrong passwords, CSRF, origins and invalid bounded payloads: %o", async (options) => {
    const response = await handleOwnerLogin(loginRequest(options), httpOptions());
    expect([400, 401, 403]).toContain(response.status);
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(response.headers.get("cache-control")).toContain("no-store");
  });
  it("applies a bounded process-local supplementary attempt limit", async () => {
    const options = httpOptions();
    for (let attempt = 0; attempt < 5; attempt++) expect((await handleOwnerLogin(loginRequest({ password: "incorrect" }), options)).status).toBe(401);
    const rejected = await handleOwnerLogin(loginRequest({ password: "incorrect" }), options);
    expect(rejected.status).toBe(429);
    expect(rejected.headers.get("retry-after")).toBe("300");
  }, 15_000);
  it("signs out only through same-origin POST with a valid session CSRF", async () => {
    const token = issueSession(config(), now), session = readSession(config(), token, now)!;
    const request = sessionRequest({ method: "POST", target: `${origin}/api/owner/logout`, token, origin, csrf: session.csrfToken });
    const response = await handleOwnerLogout(request, httpOptions());
    expect(response.status).toBe(200);
    expect(response.headers.getSetCookie().every((cookie) => cookie.includes("Max-Age=0"))).toBe(true);
    expect((await handleOwnerLogout(sessionRequest({ method: "GET" }), httpOptions())).status).toBe(405);
    expect((await handleOwnerLogout(sessionRequest({ method: "POST", origin, token }), httpOptions())).status).toBe(403);
  });
  it("returns the session CSRF only to the authenticated same-origin browser", async () => {
    const token = issueSession(config(), now), session = readSession(config(), token, now)!;
    const request = new Request(`${origin}/api/owner/login`, { headers: { cookie: `${cookieName(config(), "session")}=${token}` } });
    const response = await handleOwnerLogin(request, httpOptions());
    expect(await response.json()).toEqual({ authenticated: true, csrfToken: session.csrfToken });
    expect(requestCookie(request, cookieName(config(), "session"))).toBe(token);
  });
});
