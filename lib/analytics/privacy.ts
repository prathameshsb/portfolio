import type { AnalyticsEnvironment } from "./schema";

export function analyticsEnvironment(env: Partial<NodeJS.ProcessEnv> = process.env): AnalyticsEnvironment {
  if (env.NETLIFY === "true") return env.CONTEXT === "production" ? "production" : "preview";
  return env.ANALYTICS_ENVIRONMENT === "production" ? "production" : env.ANALYTICS_ENVIRONMENT === "preview" ? "preview" : "development";
}
export function cleanPublicPath(value: string): string {
  try { return new URL(value, "https://portfolio.invalid").pathname.replace(/\/+$/, "") || "/"; }
  catch { return "/"; }
}
export function privacyOptOut(headers: Headers): boolean {
  return headers.get("dnt") === "1" || headers.get("sec-gpc") === "1";
}
export function allowedOrigins(env: Partial<NodeJS.ProcessEnv> = process.env): Set<string> {
  const values = (env.ANALYTICS_ALLOWED_ORIGINS || "").split(",").filter(Boolean);
  if (analyticsEnvironment(env) === "development") values.push("http://127.0.0.1:3000", "http://localhost:3000");
  return new Set(values.flatMap((value) => {
    try { const url = new URL(value.trim()); return (url.protocol === "https:" || (analyticsEnvironment(env) === "development" && url.protocol === "http:")) && url.origin === value.trim() ? [url.origin] : []; }
    catch { return []; }
  }));
}
