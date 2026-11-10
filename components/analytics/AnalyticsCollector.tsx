'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import type { EventInput } from '@/lib/analytics/schema';
import { EventQueue, type EventAcknowledgement } from '@/lib/analytics/queue';

const PUBLIC_ROUTES = new Set(['/', '/about', '/projects/findem-query-insights-hub', '/projects/nexa', '/projects/nexa-design-system', '/projects/gryphon-sales-analytics', '/projects/findem-checkout-flow', '/projects/findem-password-validator', '/projects/flexrent', '/projects/snapkart', '/projects/incluvie']);
const STORAGE_KEY = 'portfolio-events-v2';
const SESSION_KEY = 'portfolio-session-v2';
const SESSION_IDLE_MS = 30 * 60 * 1000;
const ACTIVE_IDLE_MS = 30_000;
let browserQueue: EventQueue | undefined;

function isOptedOut() {
  try {
    return navigator.doNotTrack === '1' || ('globalPrivacyControl' in navigator && navigator.globalPrivacyControl === true) || localStorage.getItem('portfolio-analytics-opt-out') === '1';
  } catch { return true; }
}

function attribution() {
  const params = new URLSearchParams(location.search);
  const result: NonNullable<EventInput['attribution']> = {};
  for (const [key, query] of [['source', 'utm_source'], ['medium', 'utm_medium'], ['campaign', 'utm_campaign'], ['recipientToken', 'recipient']] as const) {
    const value = params.get(query);
    if (value && new RegExp(`^[a-zA-Z0-9._~-]{1,${key === 'recipientToken' ? 64 : 80}}$`).test(value)) result[key] = value;
  }
  if (!result.source && document.referrer) {
    try {
      const referrer = new URL(document.referrer);
      if (referrer.origin !== location.origin && referrer.hostname.length <= 80 && /^[a-zA-Z0-9.-]+$/.test(referrer.hostname)) {
        result.source = referrer.hostname; result.medium = 'referral';
      }
    } catch { /* Ignore malformed referrers; never retain their paths or queries. */ }
  }
  return result;
}

export function AnalyticsCollector() {
  const pathname = usePathname();

  useEffect(() => {
    if (process.env.NEXT_PUBLIC_ANALYTICS_ENABLED !== 'true' || !PUBLIC_ROUTES.has(pathname)) return;
    if (isOptedOut()) {
      browserQueue?.clear();
      try { sessionStorage.removeItem(STORAGE_KEY); sessionStorage.removeItem(SESSION_KEY); } catch { /* Privacy controls work without storage. */ }
      return;
    }
    let queue: EventQueue;
    try {
      browserQueue ??= new EventQueue({ read: () => sessionStorage.getItem(STORAGE_KEY), write: (value) => sessionStorage.setItem(STORAGE_KEY, value) });
      queue = browserQueue;
      queue.resume();
    } catch { return; }

    let trackingAttribution = attribution();
    let traffic: EventInput['traffic'] = 'visitor';
    try { const configured = localStorage.getItem('portfolio-analytics-traffic'); if (configured === 'owner' || configured === 'test') traffic = configured; } catch { /* Default remains anonymous visitor traffic. */ }
    let sessionId: string = crypto.randomUUID();
    let lastSessionActivity = Date.now();
    let lastInteraction = Date.now();
    let lastTick = Date.now();
    let pendingActiveMs = 0;
    let totalActiveMs = 0;
    let stopped = false;
    let didExit = false;
    const reached = new Set<number>();
    let retry: ReturnType<typeof setTimeout> | undefined;

    function stopForPrivacy() {
      queue.clear(); stopped = true; pendingActiveMs = 0;
      if (retry) clearTimeout(retry);
      try { sessionStorage.removeItem(SESSION_KEY); } catch { /* Privacy does not depend on storage availability. */ }
    }

    try {
      const previous: unknown = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null');
      if (previous && typeof previous === 'object' && 'id' in previous && 'at' in previous && typeof previous.id === 'string' && /^[a-f0-9-]{36}$/i.test(previous.id) && typeof previous.at === 'number' && Date.now() - previous.at < SESSION_IDLE_MS) {
        sessionId = previous.id;
        if ('totalActiveMs' in previous && typeof previous.totalActiveMs === 'number' && Number.isInteger(previous.totalActiveMs) && previous.totalActiveMs >= 0 && previous.totalActiveMs <= 21_600_000) totalActiveMs = previous.totalActiveMs;
        if ('attribution' in previous && previous.attribution && typeof previous.attribution === 'object') {
          const saved: NonNullable<EventInput['attribution']> = {};
          for (const key of ['source', 'medium', 'campaign', 'recipientToken'] as const) {
            const value = (previous.attribution as Record<string, unknown>)[key];
            if (typeof value === 'string' && new RegExp(`^[a-zA-Z0-9._~-]{1,${key === 'recipientToken' ? 64 : 80}}$`).test(value)) saved[key] = value;
          }
          trackingAttribution = saved;
        }
      }
    } catch { /* A malformed or unavailable session starts a new anonymous session. */ }

    function persistSession() {
      if (stopped) return;
      try { sessionStorage.setItem(SESSION_KEY, JSON.stringify({ id: sessionId, at: lastSessionActivity, attribution: trackingAttribution, totalActiveMs })); } catch { /* Collection is best effort. */ }
    }

    function emit(fields: Pick<EventInput, 'type'> & Partial<Pick<EventInput, 'targetId' | 'scrollDepth' | 'activeMs'>>) {
      if (stopped) return;
      if (isOptedOut()) { stopForPrivacy(); return; }
      queue.add({
        eventId: crypto.randomUUID(), sessionId, occurredAt: new Date().toISOString(), route: pathname as EventInput['route'], traffic,
        ...(pathname.startsWith('/projects/') ? { projectId: pathname.slice('/projects/'.length) as EventInput['projectId'] } : {}),
        appVersion: process.env.NEXT_PUBLIC_APP_VERSION || 'local',
        contentVersion: 'framer-2026-11-10', attribution: trackingAttribution, ...fields,
        ...(fields.type === 'engagement' ? { totalActiveMs } : {}),
      });
    }

    async function send(events: EventInput[]): Promise<EventAcknowledgement> {
      if (stopped || isOptedOut()) { stopForPrivacy(); return { accepted: [], duplicates: [], ignored: events.map((event) => event.eventId) }; }
      const response = await fetch('/api/events', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'omit',
        body: JSON.stringify({ schemaVersion: 2, events }), keepalive: true, signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) throw new Error('Collection unavailable');
      const result = await response.json() as EventAcknowledgement & { optedOut?: boolean };
      if (result.optedOut) stopForPrivacy();
      return result;
    }

    function schedule(delay = 1000) {
      if (stopped || retry || queue.exhausted || !queue.pending) return;
      retry = setTimeout(async () => {
        retry = undefined;
        const sent = await queue.flush(send);
        schedule(sent ? 1000 : queue.retryDelay);
      }, delay);
    }

    function interaction() {
      if (stopped || isOptedOut()) { stopForPrivacy(); return; }
      const now = Date.now();
      if (now - lastSessionActivity >= SESSION_IDLE_MS) {
        if (pendingActiveMs > 0) { emit({ type: 'engagement', activeMs: pendingActiveMs }); pendingActiveMs = 0; }
        sessionId = crypto.randomUUID();
        totalActiveMs = 0;
        reached.clear();
        emit({ type: 'page_view' });
      }
      lastSessionActivity = now;
      lastInteraction = now;
      persistSession();
    }

    function tick() {
      if (stopped || isOptedOut()) { stopForPrivacy(); return; }
      const now = Date.now();
      const active = document.visibilityState === 'visible' && document.hasFocus() && now - lastInteraction < ACTIVE_IDLE_MS;
      if (active) {
        const delta = Math.max(0, Math.min(now - lastTick, 5000, 21_600_000 - totalActiveMs));
        pendingActiveMs += delta;
        totalActiveMs += delta;
        persistSession();
      }
      lastTick = now;
      if (pendingActiveMs >= 15_000 || (!active && pendingActiveMs > 0)) { emit({ type: 'engagement', activeMs: pendingActiveMs }); pendingActiveMs = 0; schedule(); }
    }

    function click(event: MouseEvent) {
      interaction();
      const target = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-analytics-target]') : null;
      const targetId = target?.dataset.analyticsTarget;
      if (targetId && /^[a-z][a-z0-9-]{0,99}$/.test(targetId)) { emit({ type: 'click', targetId }); schedule(); }
    }

    function scroll() {
      interaction();
      const available = document.documentElement.scrollHeight - innerHeight;
      if (available <= 0) return;
      const percent = (scrollY / available) * 100;
      for (const milestone of [25, 50, 75, 90, 100] as const) {
        if (percent >= milestone && !reached.has(milestone)) { reached.add(milestone); emit({ type: 'scroll', scrollDepth: milestone }); }
      }
      schedule();
    }

    function exit() {
      if (didExit) return;
      didExit = true;
      tick();
      if (pendingActiveMs > 0) { emit({ type: 'engagement', activeMs: pendingActiveMs }); pendingActiveMs = 0; }
      emit({ type: 'page_exit' });
      void queue.flush(send);
    }

    function visibility() {
      tick();
      if (document.visibilityState === 'hidden') { void queue.flush(send); }
      else { lastTick = Date.now(); queue.resume(); schedule(); }
    }
    function online() { queue.resume(); schedule(); }
    function pageShow() { didExit = false; lastTick = Date.now(); queue.resume(); schedule(); }

    persistSession();
    emit({ type: 'page_view' });
    schedule();
    const timer = setInterval(tick, 1000);
    document.addEventListener('click', click);
    document.addEventListener('keydown', interaction, { passive: true });
    document.addEventListener('pointerdown', interaction, { passive: true });
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('scroll', scroll, { passive: true });
    window.addEventListener('online', online);
    window.addEventListener('pagehide', exit);
    window.addEventListener('pageshow', pageShow);
    return () => {
      exit(); stopped = true;
      clearInterval(timer);
      if (retry) clearTimeout(retry);
      document.removeEventListener('click', click);
      document.removeEventListener('keydown', interaction);
      document.removeEventListener('pointerdown', interaction);
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('scroll', scroll);
      window.removeEventListener('online', online);
      window.removeEventListener('pagehide', exit);
      window.removeEventListener('pageshow', pageShow);
    };
  }, [pathname]);

  return null;
}
