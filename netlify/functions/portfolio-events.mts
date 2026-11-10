import type { Config, Context } from '@netlify/functions';
import { ingestRequest } from '../../lib/analytics/ingestion';

export default function portfolioEvents(request: Request, context: Context) {
  if (request.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405, headers: { Allow: 'POST', 'Cache-Control': 'no-store' } });
  return ingestRequest(request, {
    env: { ...process.env, NETLIFY: 'true', CONTEXT: context.deploy.context },
    platformRateLimited: true,
  });
}

export const config: Config = {
  path: '/api/events',
  rateLimit: { windowLimit: 120, windowSize: 60, aggregateBy: ['ip', 'domain'], action: 'rate_limit' },
};
