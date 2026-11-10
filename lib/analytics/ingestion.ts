import { AnalyticsBatchSchema, batchWithinTimeWindow } from "./schema";
import { ingestSheetBatch, TrackerWriteInvalid } from "./sheets-ingestion";
import { allowedOrigins, analyticsEnvironment, privacyOptOut } from "./privacy";

const MAX_BODY_BYTES = 64 * 1024;
const response = (body: object, status: number, extra?: Record<string, string>) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", ...extra } });
async function boundedJson(request: Request): Promise<unknown> {
  const advertised = request.headers.get("content-length");
  if (advertised && (!/^\d+$/.test(advertised) || Number(advertised) > MAX_BODY_BYTES)) throw new RangeError();
  const reader = request.body?.getReader();
  if (!reader) throw new SyntaxError();
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const part = await reader.read(); if (part.done) break;
      size += part.value.byteLength;
      if (size > MAX_BODY_BYTES) { await reader.cancel(); throw new RangeError(); }
      chunks.push(part.value);
    }
  } finally { reader.releaseLock(); }
  const buffer = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.length; }
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(buffer));
}
export interface IngestDependencies { now?: Date; env?: Partial<NodeJS.ProcessEnv>; platformRateLimited?: boolean; write?: typeof ingestSheetBatch }
export async function ingestRequest(request: Request, dependencies: IngestDependencies = {}): Promise<Response> {
  const env = dependencies.env || process.env;
  const origin = request.headers.get("origin") || "";
  if (!allowedOrigins(env).has(origin)) return response({ error: "Origin denied" }, 403);
  if (privacyOptOut(request.headers)) return response({ accepted: [], duplicates: [], optedOut: true }, 200);
  if ((env.NETLIFY === "true" || env.NODE_ENV === "production") && dependencies.platformRateLimited !== true) return response({ error: "Platform ingress required" }, 403);
  const contentType = request.headers.get("content-type") || "";
  if (!/^(application\/json|text\/plain)(;|$)/i.test(contentType)) return response({ error: "Unsupported content type" }, 415);
  let input: unknown;
  try { input = await boundedJson(request); }
  catch (error) { return response({ error: error instanceof RangeError ? "Payload too large" : "Invalid JSON" }, error instanceof RangeError ? 413 : 400); }
  const parsed = AnalyticsBatchSchema.safeParse(input);
  if (!parsed.success) return response({ error: "Invalid event batch" }, 400);
  const now = dependencies.now || new Date();
  if (!batchWithinTimeWindow(parsed.data, now.getTime())) return response({ error: "Event timestamp outside accepted window" }, 400);
  const environment = analyticsEnvironment(env);
  if (!env.GOOGLE_TRACKER_SHEET_ID || !/^[a-zA-Z0-9_-]{20,150}$/.test(env.GOOGLE_TRACKER_SHEET_ID)) return response({ error: "Analytics unavailable" }, 503);
  try {
    return response(await (dependencies.write || ingestSheetBatch)(parsed.data, origin, environment, { env }), 200);
  } catch (error) {
    return response({ error: error instanceof TrackerWriteInvalid ? "Cumulative engagement value required" : "Analytics unavailable" }, error instanceof TrackerWriteInvalid ? 400 : 503);
  }
}
