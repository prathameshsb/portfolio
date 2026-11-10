import { describe, expect, it } from 'vitest';
import { ownerAdapterRequest } from '../lib/owner-access/next-request';
import { cookieName, createOwnerAuthorizer, issueSession, ownerConfig } from '../lib/owner-access/core';

const origin = 'https://portfolio-test.netlify.app';
const env = { NETLIFY: 'true', CONTEXT: 'production', NODE_ENV: 'production', OWNER_ORIGIN: origin, OWNER_PASSWORD_HASH: `scrypt$131072$8$1$${'a'.repeat(32)}$${'b'.repeat(128)}`, OWNER_SESSION_SECRET: 'c'.repeat(64) };
const now = Date.parse('2026-11-10T16:00:00Z');
const config = ownerConfig(env)!;
const token = issueSession(config, now);
const cookie = `${cookieName(config, 'session')}=${token}`;
const authorize = createOwnerAuthorizer({ environment: () => env, now: () => now });
function request(headers: Record<string, string> = {}, method = 'GET', path = '/api/owner/report?traffic=test') {
  return new Request(`https://immutable-deploy--portfolio-test.netlify.app${path}`, { method, headers: { host: new URL(origin).host, cookie, ...headers } });
}

describe('Netlify Next request boundary', () => {
  it('pins the canonical Host despite a reconstructed first-request origin', async () => {
    const original = request();
    expect(await authorize(original)).toMatchObject({ status: 'denied', reason: 'origin' });
    const normalized = ownerAdapterRequest(original, env)!;
    expect(normalized.url).toBe(`${origin}/api/owner/report?traffic=test`);
    expect(await authorize(normalized)).toMatchObject({ status: 'authorized' });
  });
  it.each([undefined, 'immutable-deploy--portfolio-test.netlify.app', 'attacker.example'])('denies missing or alternate raw Host: %s', (host) => {
    const headers = new Headers({ cookie, 'x-forwarded-host': new URL(origin).host });
    if (host) headers.set('host', host);
    expect(ownerAdapterRequest(new Request(`${origin}/api/owner/report`, { headers }), env)).toBeUndefined();
  });
  it('retains Origin, cross-site, session and mutation-CSRF checks', async () => {
    for (const original of [request({ origin: 'https://attacker.example' }), request({ 'sec-fetch-site': 'cross-site' }), request({ cookie: '' }), request({ origin }, 'POST')]) {
      expect(await authorize(ownerAdapterRequest(original, env)!)).toMatchObject({ status: 'denied' });
    }
  });
  it('preserves mutation method, body and headers without resolving network paths', async () => {
    const original = new Request('https://immutable-deploy--portfolio-test.netlify.app//attacker.example/logout', { method: 'POST', body: 'fixture', headers: { host: new URL(origin).host, origin, cookie, 'x-owner-csrf': 'fixture' } });
    const normalized = ownerAdapterRequest(original, env)!;
    expect(new URL(normalized.url).origin).toBe(origin);
    expect(new URL(normalized.url).pathname).toBe('//attacker.example/logout');
    expect(normalized.method).toBe('POST');
    expect(normalized.headers.get('x-owner-csrf')).toBe('fixture');
    expect(await normalized.text()).toBe('fixture');
  });
  it('does not normalize outside the server Netlify runtime', () => {
    const original = request();
    expect(ownerAdapterRequest(original, { ...env, NETLIFY: 'false' })).toBe(original);
  });
  it('recognizes the read-only SITE_ID available to deployed functions', async () => {
    const runtime = { ...env, NETLIFY: undefined, SITE_ID: '11111111-1111-4111-8111-111111111111' };
    const normalized = ownerAdapterRequest(request(), runtime)!;
    expect(normalized.url).toBe(`${origin}/api/owner/report?traffic=test`);
    expect(await authorize(normalized)).toMatchObject({ status: 'authorized' });
  });
});
