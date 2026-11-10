import type { Config, Context } from '@netlify/functions';
import { handleOwnerLogin } from '../../lib/owner-access/http';

export default function ownerLogin(request: Request, context: Context) {
  return handleOwnerLogin(request, {
    environment: () => ({ ...process.env, NETLIFY: 'true', CONTEXT: context.deploy.context }),
    platformRateLimited: true,
    clientIp: context.ip,
  });
}

export const config: Config = {
  path: '/api/owner/login',
  rateLimit: { windowLimit: 10, windowSize: 180, aggregateBy: ['ip', 'domain'], action: 'rate_limit' },
};
