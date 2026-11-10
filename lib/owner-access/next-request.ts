import { ownerConfig, type OwnerEnvironment } from './core';

export function ownerAdapterRequest(request: Request, environment: OwnerEnvironment): Request | undefined {
  const deployedSite = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(environment.SITE_ID || '');
  if (environment.NETLIFY !== 'true' && !deployedSite) return request;
  const config = ownerConfig(environment);
  if (!config) return request;
  const canonical = new URL(config.origin);
  if (request.headers.get('host') !== canonical.host) return undefined;
  // The Next adapter can reconstruct URL origins from a previous request's host.
  // Use the configured origin only after validating this request's actual Host.
  const incoming = new URL(request.url);
  canonical.pathname = incoming.pathname;
  canonical.search = incoming.search;
  return new Request(canonical, request);
}
