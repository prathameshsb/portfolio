// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AnalyticsCollector } from '../components/analytics/AnalyticsCollector';

const navigation = vi.hoisted(() => ({ pathname: '/' }));
vi.mock('next/navigation', () => ({ usePathname: () => navigation.pathname, useSearchParams: () => new URLSearchParams(window.location.search) }));
const delivered: Array<Record<string, unknown>> = [];
const fetcher = vi.fn(async (_url: string, init: RequestInit) => {
  const body = JSON.parse(String(init.body));
  delivered.push(...body.events);
  return Response.json({ accepted: body.events.map((event: { eventId: string }) => event.eventId), duplicates: [] });
});

beforeAll(() => { vi.useFakeTimers(); });
afterAll(() => { vi.useRealTimers(); });
beforeEach(() => {
  vi.setSystemTime(new Date('2026-11-10T15:00:00Z'));
  vi.stubEnv('NEXT_PUBLIC_ANALYTICS_ENABLED', 'true'); vi.stubGlobal('fetch', fetcher);
  Object.defineProperty(navigator, 'doNotTrack', { configurable: true, value: '0' });
  Object.defineProperty(navigator, 'globalPrivacyControl', { configurable: true, value: false });
  vi.spyOn(document, 'hasFocus').mockReturnValue(true);
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  localStorage.clear(); sessionStorage.clear(); navigation.pathname = '/';
  localStorage.setItem('portfolio-analytics-opt-out', '1');
  render(<AnalyticsCollector />); cleanup(); localStorage.clear();
  delivered.length = 0; fetcher.mockClear();
  window.history.replaceState(null, '', '/');
});
afterEach(async () => { cleanup(); await act(async () => {}); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('public analytics lifecycle', () => {
  it('never collects dashboard or unknown routes', async () => {
    navigation.pathname = '/owner'; render(<AnalyticsCollector />);
    await act(() => vi.advanceTimersByTimeAsync(60_000));
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('honors DNT, GPC and browser opt-out without sending stored events', async () => {
    Object.defineProperty(navigator, 'doNotTrack', { configurable: true, value: '1' });
    render(<AnalyticsCollector />);
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(fetcher).not.toHaveBeenCalled(); expect(sessionStorage.getItem('portfolio-session-v2')).toBeNull();
  });

  it('preserves session attribution through internal navigation without sensitive URL parameters', async () => {
    window.history.replaceState(null, '', '/?utm_source=resume&utm_medium=pdf&utm_campaign=general&email=private');
    const { rerender } = render(<AnalyticsCollector />);
    await act(() => vi.advanceTimersByTimeAsync(1100));
    window.history.replaceState(null, '', '/projects/nexa'); navigation.pathname = '/projects/nexa';
    rerender(<AnalyticsCollector />);
    await act(() => vi.advanceTimersByTimeAsync(2100));
    const views = delivered.filter((event) => event.type === 'page_view');
    expect(views).toHaveLength(2);
    expect(views[0].sessionId).toBe(views[1].sessionId);
    expect(views[1].attribution).toEqual({ source: 'resume', medium: 'pdf', campaign: 'general' });
    expect(delivered.some((event) => event.type === 'page_exit' && event.route === '/')).toBe(true);
    expect(JSON.stringify(delivered)).not.toContain('private');
  });

  it('starts a resume-attributed session instead of restoring an earlier direct visit', async () => {
    const direct = render(<AnalyticsCollector />);
    await act(() => vi.advanceTimersByTimeAsync(2100));
    const previous = JSON.parse(sessionStorage.getItem('portfolio-session-v2') || 'null');
    direct.unmount();
    window.history.replaceState(null, '', '/?utm_source=resume&utm_medium=pdf&utm_campaign=product-design-san-jose');
    render(<AnalyticsCollector />);
    await act(() => vi.advanceTimersByTimeAsync(1100));
    const views = delivered.filter((event) => event.type === 'page_view');
    expect(views).toHaveLength(2);
    expect(views[0].attribution).toEqual({});
    expect(views[1].attribution).toEqual({ source: 'resume', medium: 'pdf', campaign: 'product-design-san-jose' });
    expect(views[1].sessionId).not.toBe(previous.id);
    expect(JSON.parse(sessionStorage.getItem('portfolio-session-v2') || 'null').totalActiveMs).toBe(1000);
  });

  it('separates a new resume campaign while preserving queued events from the earlier campaign', async () => {
    window.history.replaceState(null, '', '/?utm_source=resume&utm_medium=pdf&utm_campaign=product-design-san-jose');
    const previous = render(<AnalyticsCollector />);
    const firstSession = JSON.parse(sessionStorage.getItem('portfolio-session-v2') || 'null').id;
    previous.unmount();
    window.history.replaceState(null, '', '/projects/nexa?utm_source=resume&utm_medium=pdf&utm_campaign=design-engineering-new-york');
    navigation.pathname = '/projects/nexa';
    render(<AnalyticsCollector />);
    await act(() => vi.advanceTimersByTimeAsync(1100));
    const views = delivered.filter((event) => event.type === 'page_view');
    expect(views).toHaveLength(2);
    expect(views[0]).toMatchObject({ sessionId: firstSession, attribution: { campaign: 'product-design-san-jose' } });
    expect(views[1]).toMatchObject({ route: '/projects/nexa', projectId: 'nexa', attribution: { source: 'resume', medium: 'pdf', campaign: 'design-engineering-new-york' } });
    expect(views[1].sessionId).not.toBe(firstSession);
  });

  it('keeps the same session and active total for a matching tagged entry', async () => {
    window.history.replaceState(null, '', '/?utm_source=resume&utm_medium=pdf&utm_campaign=product-design-san-jose');
    const previous = render(<AnalyticsCollector />);
    await act(() => vi.advanceTimersByTimeAsync(2100));
    const firstSession = JSON.parse(sessionStorage.getItem('portfolio-session-v2') || 'null').id;
    previous.unmount();
    navigation.pathname = '/projects/nexa';
    window.history.replaceState(null, '', '/projects/nexa?utm_source=resume&utm_medium=pdf&utm_campaign=product-design-san-jose');
    render(<AnalyticsCollector />);
    await act(() => vi.advanceTimersByTimeAsync(1100));
    const views = delivered.filter((event) => event.type === 'page_view');
    expect(views[1].sessionId).toBe(firstSession);
    expect(JSON.parse(sessionStorage.getItem('portfolio-session-v2') || 'null').totalActiveMs).toBe(3100);
  });

  it.each([
    ['utm_source', 'email', { source: 'email' }],
    ['utm_medium', 'document', { medium: 'document' }],
    ['recipient', 'issued-link-b', { recipientToken: 'issued-link-b' }],
  ])('starts a new session when explicit %s changes', async (parameter, value, expected) => {
    const tags = new URLSearchParams({ utm_source: 'resume', utm_medium: 'pdf', utm_campaign: 'product-design-san-jose', recipient: 'issued-link-a' });
    window.history.replaceState(null, '', `/?${tags}`);
    const previous = render(<AnalyticsCollector />);
    const firstSession = JSON.parse(sessionStorage.getItem('portfolio-session-v2') || 'null').id;
    previous.unmount();
    tags.set(parameter, value);
    navigation.pathname = '/about';
    window.history.replaceState(null, '', `/about?${tags}`);
    render(<AnalyticsCollector />);
    await act(() => vi.advanceTimersByTimeAsync(1100));
    const views = delivered.filter((event) => event.type === 'page_view');
    expect(views[1].sessionId).not.toBe(firstSession);
    expect(views[1].attribution).toMatchObject(expected);
  });

  it('does not treat an unchanged external referrer as a new tagged entry during navigation', async () => {
    vi.spyOn(document, 'referrer', 'get').mockReturnValue('https://search.example.com/private/path?q=secret');
    const { rerender } = render(<AnalyticsCollector />);
    await act(() => vi.advanceTimersByTimeAsync(1100));
    navigation.pathname = '/about'; window.history.replaceState(null, '', '/about');
    rerender(<AnalyticsCollector />);
    await act(() => vi.advanceTimersByTimeAsync(1100));
    const views = delivered.filter((event) => event.type === 'page_view');
    expect(views[0].sessionId).toBe(views[1].sessionId);
    expect(views[1].attribution).toEqual({ source: 'search.example.com', medium: 'referral' });
    expect(JSON.stringify(delivered)).not.toContain('secret');
  });

  it('ignores invalid attribution parameters when restoring a session', async () => {
    window.history.replaceState(null, '', '/?utm_source=resume&utm_medium=pdf&utm_campaign=product-design-san-jose');
    const previous = render(<AnalyticsCollector />);
    await act(() => vi.advanceTimersByTimeAsync(1100));
    const firstSession = JSON.parse(sessionStorage.getItem('portfolio-session-v2') || 'null').id;
    previous.unmount();
    navigation.pathname = '/about';
    window.history.replaceState(null, '', '/about?utm_source=private%40example.com&utm_campaign=bad%20campaign&recipient=not%40safe');
    render(<AnalyticsCollector />);
    await act(() => vi.advanceTimersByTimeAsync(1100));
    const views = delivered.filter((event) => event.type === 'page_view');
    expect(views[1].sessionId).toBe(firstSession);
    expect(views[1].attribution).toEqual({ source: 'resume', medium: 'pdf', campaign: 'product-design-san-jose' });
    expect(JSON.stringify(delivered)).not.toContain('private@example.com');
    expect(JSON.stringify(delivered)).not.toContain('bad campaign');
  });

  it('recognizes a changed valid campaign on the same route without remounting', async () => {
    window.history.replaceState(null, '', '/?utm_source=resume&utm_medium=pdf&utm_campaign=product-design-san-jose');
    const { rerender } = render(<AnalyticsCollector />);
    const original = JSON.parse(sessionStorage.getItem('portfolio-session-v2') || 'null');
    window.history.replaceState(null, '', '/?utm_source=resume&utm_medium=pdf&utm_campaign=design-engineering-new-york');
    rerender(<AnalyticsCollector />);
    await act(() => vi.advanceTimersByTimeAsync(1100));
    const views = delivered.filter((event) => event.type === 'page_view');
    expect(views).toHaveLength(2);
    expect(views[0]).toMatchObject({ sessionId: original.id, attribution: { campaign: 'product-design-san-jose' } });
    expect(views[1]).toMatchObject({ route: '/', attribution: { campaign: 'design-engineering-new-york' } });
    expect(views[1].sessionId).not.toBe(original.id);
  });

  it('ignores unrelated and invalid query changes on the same route', async () => {
    window.history.replaceState(null, '', '/?utm_source=resume&utm_medium=pdf&utm_campaign=product-design-san-jose');
    const { rerender } = render(<AnalyticsCollector />);
    await act(() => vi.advanceTimersByTimeAsync(1100));
    const original = JSON.parse(sessionStorage.getItem('portfolio-session-v2') || 'null');
    window.history.replaceState(null, '', '/?utm_source=resume&utm_medium=pdf&utm_campaign=product-design-san-jose&email=private&recipient=bad%40value&utm_content=private%40example.com');
    rerender(<AnalyticsCollector />);
    await act(() => vi.advanceTimersByTimeAsync(1100));
    expect(delivered.filter((event) => event.type === 'page_view')).toHaveLength(1);
    expect(delivered.filter((event) => event.type === 'page_exit')).toHaveLength(0);
    expect(JSON.parse(sessionStorage.getItem('portfolio-session-v2') || 'null').id).toBe(original.id);
    expect(JSON.stringify(delivered)).not.toContain('private');
    expect(JSON.stringify(delivered)).not.toContain('bad@value');
  });

  it.each([
    ['/', 'portfolio', undefined],
    ['/projects/findem-query-insights-hub', 'findem-query-insights-hub', 'findem-query-insights-hub'],
    ['/', 'interaction-motion', undefined],
  ])('records the explicit resume entry link %s / %s', async (route, content, projectId) => {
    navigation.pathname = route;
    window.history.replaceState(null, '', `${route}?utm_source=resume&utm_medium=pdf&utm_campaign=product-design-san-jose&utm_content=${content}`);
    render(<AnalyticsCollector />);
    await act(() => vi.advanceTimersByTimeAsync(1100));
    const view = delivered.find((event) => event.type === 'page_view');
    expect(view).toMatchObject({ route, targetId: `resume.entry.${content}` });
    expect(view?.projectId).toBe(projectId);
  });

  it('does not carry the entry-link target into later internal page views', async () => {
    window.history.replaceState(null, '', '/?utm_source=resume&utm_medium=pdf&utm_campaign=product-design-san-jose&utm_content=portfolio');
    const { rerender } = render(<AnalyticsCollector />);
    await act(() => vi.advanceTimersByTimeAsync(1100));
    window.history.replaceState(null, '', '/projects/nexa'); navigation.pathname = '/projects/nexa';
    rerender(<AnalyticsCollector />);
    await act(() => vi.advanceTimersByTimeAsync(1100));
    const views = delivered.filter((event) => event.type === 'page_view');
    expect(views[0].targetId).toBe('resume.entry.portfolio');
    expect(views[1].targetId).toBeUndefined();
    expect(views[0].sessionId).toBe(views[1].sessionId);
  });

  it('records a different same-route resume entry without splitting the same campaign session', async () => {
    window.history.replaceState(null, '', '/?utm_source=resume&utm_medium=pdf&utm_campaign=product-design-san-jose&utm_content=portfolio');
    const { rerender } = render(<AnalyticsCollector />);
    window.history.replaceState(null, '', '/?utm_source=resume&utm_medium=pdf&utm_campaign=product-design-san-jose&utm_content=interaction-motion');
    rerender(<AnalyticsCollector />);
    await act(() => vi.advanceTimersByTimeAsync(1100));
    const views = delivered.filter((event) => event.type === 'page_view');
    expect(views).toHaveLength(2);
    expect(views.map((event) => event.targetId)).toEqual(['resume.entry.portfolio', 'resume.entry.interaction-motion']);
    expect(views[0].sessionId).toBe(views[1].sessionId);
  });

  it.each([
    ['resume', 'private%40example.com'],
    ['resume', 'unrecognized-safe-token'],
    ['email', 'portfolio'],
    ['', 'portfolio'],
  ])('omits entry targets for source %s and non-eligible content %s', async (source, content) => {
    window.history.replaceState(null, '', `/?utm_source=${source}&utm_content=${content}`);
    render(<AnalyticsCollector />);
    await act(() => vi.advanceTimersByTimeAsync(1100));
    expect(delivered.find((event) => event.type === 'page_view')?.targetId).toBeUndefined();
    expect(JSON.stringify(delivered)).not.toContain('private@example.com');
    expect(JSON.stringify(delivered)).not.toContain('unrecognized-safe-token');
  });

  it('records semantic click IDs and explicit owner/test cohort hints', async () => {
    localStorage.setItem('portfolio-analytics-traffic', 'test');
    render(<><AnalyticsCollector /><button data-analytics-target="project-nexa">Open</button></>);
    document.querySelector('button')?.click();
    await act(() => vi.advanceTimersByTimeAsync(1100));
    expect(delivered.find((event) => event.type === 'click')).toMatchObject({ targetId: 'project-nexa', traffic: 'test' });
    expect(delivered.every((event) => !('url' in event))).toBe(true);
  });

  it('does not count hidden or long-idle time as active engagement', async () => {
    render(<AnalyticsCollector />);
    await act(() => vi.advanceTimersByTimeAsync(1100));
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
    await act(() => vi.advanceTimersByTimeAsync(120_000));
    const activeMs = delivered.filter((event) => event.type === 'engagement').reduce((total, event) => total + Number(event.activeMs), 0);
    expect(activeMs).toBeGreaterThan(0);
    expect(activeMs).toBeLessThanOrEqual(1100);
  });

  it('discards pending events when privacy preferences change before delivery', async () => {
    render(<AnalyticsCollector />);
    localStorage.setItem('portfolio-analytics-opt-out', '1');
    await act(() => vi.advanceTimersByTimeAsync(2100));
    expect(fetcher).not.toHaveBeenCalled();
    expect(sessionStorage.getItem('portfolio-session-v2')).toBeNull();
    expect(JSON.parse(sessionStorage.getItem('portfolio-events-v2') || '[]')).toEqual([]);
  });

  it('carries cumulative active time across internal routes without recounting it', async () => {
    const { rerender } = render(<AnalyticsCollector />);
    await act(() => vi.advanceTimersByTimeAsync(2100));
    navigation.pathname = '/about'; rerender(<AnalyticsCollector />);
    await act(() => vi.advanceTimersByTimeAsync(2100));
    window.dispatchEvent(new Event('pagehide'));
    await act(async () => {});
    const engagement = delivered.filter((event) => event.type === 'engagement');
    expect(engagement).toHaveLength(2);
    expect(engagement[0]).toMatchObject({ activeMs: 2100, totalActiveMs: 2100 });
    expect(engagement[1]).toMatchObject({ activeMs: 2100, totalActiveMs: 4200 });
  });

  it('rolls anonymous sessions after inactivity rather than retaining one tab forever', async () => {
    render(<><AnalyticsCollector /><button data-analytics-target="nav-about">About</button></>);
    await act(() => vi.advanceTimersByTimeAsync(1100));
    await act(() => vi.advanceTimersByTimeAsync(31 * 60_000));
    document.querySelector('button')?.click();
    await act(() => vi.advanceTimersByTimeAsync(1100));
    const views = delivered.filter((event) => event.type === 'page_view');
    expect(views).toHaveLength(2); expect(views[0].sessionId).not.toBe(views[1].sessionId);
  });
});
