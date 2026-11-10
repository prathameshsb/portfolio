import { describe, expect, it } from "vitest";
import { AnalyticsBatchSchema, AnalyticsEventSchema, batchWithinTimeWindow } from "../lib/analytics/schema";
import { allowedOrigins, analyticsEnvironment, cleanPublicPath, privacyOptOut } from "../lib/analytics/privacy";

const event = { eventId:"11111111-1111-4111-8111-111111111111",sessionId:"22222222-2222-4222-8222-222222222222",type:"page_view",occurredAt:"2026-11-10T14:00:00.000Z",route:"/",appVersion:"1.0.0",contentVersion:"2026-11-10" };
describe("public analytics boundary", () => {
  it("accepts anonymous native route events and strips no unknown properties silently", () => {
    expect(AnalyticsEventSchema.parse(event).traffic).toBe("visitor");
    for (const extra of [{rawIp:"127.0.0.1"},{legacyActiveMs:1000000},{url:"/?password=secret"},{environment:"production"},{email:"person@example.com"}]) expect(AnalyticsEventSchema.safeParse({...event,...extra}).success).toBe(false);
  });
  it("rejects excluded/private routes, mismatched projects, wrong metrics and arbitrary target text", () => {
    const invalid = [{route:"/projects/interaction-motion"},{route:"/owner"},{route:"/?token=secret"},{projectId:"nexa"},{type:"engagement",activeMs:60001},{type:"click"},{type:"scroll",scrollDepth:99},{type:"click",targetId:"email person@example.com"},{activeMs:10}];
    for (const patch of invalid) expect(AnalyticsEventSchema.safeParse({...event,...patch}).success).toBe(false);
  });
  it("bounds event count, event IDs and attribution; deduplicates batches explicitly", () => {
    expect(AnalyticsBatchSchema.safeParse({schemaVersion:2,events:[event,event]}).success).toBe(false);
    expect(AnalyticsBatchSchema.safeParse({schemaVersion:2,events:[]}).success).toBe(false);
    expect(AnalyticsBatchSchema.safeParse({schemaVersion:2,events:Array.from({length:21},(_,index)=>({...event,eventId:`11111111-1111-4111-8111-${String(index).padStart(12,"0")}`}))}).success).toBe(false);
    expect(AnalyticsEventSchema.safeParse({...event,attribution:{recipientToken:"a".repeat(65)}}).success).toBe(false);
  });
  it("accepts offline retries for 24h and tolerates only five minutes of clock skew", () => {
    const batch=AnalyticsBatchSchema.parse({schemaVersion:2,events:[event]});
    expect(batchWithinTimeWindow(batch,Date.parse(event.occurredAt)+86_400_000)).toBe(true);
    expect(batchWithinTimeWindow(batch,Date.parse(event.occurredAt)+86_400_001)).toBe(false);
    expect(batchWithinTimeWindow(batch,Date.parse(event.occurredAt)-300_001)).toBe(false);
  });
  it("uses server deployment context and honors explicit privacy signals", () => {
    expect(analyticsEnvironment({NETLIFY:"true",CONTEXT:"deploy-preview",ANALYTICS_ENVIRONMENT:"production"})).toBe("preview");
    expect(allowedOrigins({NETLIFY:"true",CONTEXT:"production",ANALYTICS_ALLOWED_ORIGINS:"https://portfolio.example,https://bad.example/path,http://localhost:3000"})).toEqual(new Set(["https://portfolio.example"]));
    expect(privacyOptOut(new Headers({"sec-gpc":"1"}))).toBe(true);
    expect(privacyOptOut(new Headers({dnt:"1"}))).toBe(true);
    expect(cleanPublicPath("/about?email=private#secret")).toBe("/about");

  });
});
