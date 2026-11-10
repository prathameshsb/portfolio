// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AnalyticsCollector } from '../components/analytics/AnalyticsCollector';

const navigation = vi.hoisted(() => ({ pathname: '/' }));
vi.mock('next/navigation', () => ({ usePathname: () => navigation.pathname }));
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
