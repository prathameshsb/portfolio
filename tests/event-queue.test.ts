import { describe, expect, it } from 'vitest';
import { EventQueue } from '../lib/analytics/queue';
import type { EventInput } from '../lib/analytics/schema';

function fixture(id = 'd6492b48-7422-4f2d-8568-4cba099e78cc'): EventInput {
  return { eventId: id, sessionId: '6f778a2f-1916-46e3-80c3-62d2687066c0', type: 'page_view', occurredAt: '2026-11-10T12:00:00.000Z', route: '/', appVersion: 'test', contentVersion: 'test', traffic: 'visitor' };
}
function setup() {
  let saved: string | null = null;
  const storage = { read: () => saved, write: (value: string) => { saved = value; } };
  const now = () => Date.parse('2026-11-10T12:01:00Z');
  return { storage, now, queue: new EventQueue(storage, now) };
}

describe('acknowledged delivery', () => {
  it('retains failed sends across reloads and deletes only confirmed persisted IDs', async () => {
    const { queue, storage, now } = setup();
    queue.add(fixture());
    expect(await queue.flush(async () => { throw new Error('offline'); })).toBe(false);
    const restored = new EventQueue(storage, now);
    expect(restored.pending).toBe(1);
    await restored.flush(async () => ({ accepted: [], duplicates: [fixture().eventId] }));
    expect(new EventQueue(storage, now).pending).toBe(0);
  });

  it('cannot clear pending events with an opaque or unrelated acknowledgement', async () => {
    const { queue } = setup();
    queue.add(fixture());
    expect(await queue.flush(async () => ({ accepted: ['unrelated'], duplicates: [] }))).toBe(false);
    expect(queue.pending).toBe(1);
  });

  it('removes explicitly unsupported events without counting them as stored acknowledgements', async () => {
    const { queue } = setup();
    queue.add({ ...fixture(), type: 'page_exit' });
    expect(await queue.flush(async () => ({ accepted: [], duplicates: [], ignored: [fixture().eventId] }))).toBe(true);
    expect(queue.pending).toBe(0);
  });

  it('keeps concurrently added events while acknowledging the in-flight batch', async () => {
    const { queue } = setup();
    queue.add(fixture());
    let release!: () => void;
    const wait = new Promise<void>((resolve) => { release = resolve; });
    const sending = queue.flush(async (events) => { await wait; return { accepted: events.map((event) => event.eventId), duplicates: [] }; });
    queue.add(fixture('7a34fb7f-bdd7-4333-8152-10eb165cfeef'));
    release();
    await sending;
    expect(queue.pending).toBe(1);
  });

  it('bounds retry attempts and resumes on an explicit connectivity/lifecycle signal', async () => {
    const { queue } = setup();
    queue.add(fixture());
    let calls = 0;
    const fail = async () => { calls++; throw new Error('503'); };
    for (let count = 0; count < 20; count++) await queue.flush(fail);
    expect(calls).toBe(6);
    expect(queue.exhausted).toBe(true);
    queue.resume();
    await queue.flush(fail);
    expect(calls).toBe(7);
  });

  it('bounds retained queue and batches without dropping unacknowledged current events', async () => {
    const { queue } = setup();
    for (let count = 0; count < 110; count++) queue.add(fixture(`event-${count}`));
    expect(queue.pending).toBe(100);
    await queue.flush(async (events) => {
      expect(events).toHaveLength(20);
      expect(events[0].eventId).toBe('event-10');
      return { accepted: events.map((event) => event.eventId), duplicates: [] };
    });
    expect(queue.pending).toBe(80);
  });

  it('expires old events and works when browser storage throws', () => {
    const { queue } = setup();
    queue.add({ ...fixture(), occurredAt: '2026-11-08T12:00:00.000Z' });
    expect(queue.pending).toBe(0);
    queue.add(fixture('current'));
    expect(queue.pending).toBe(1);
    const unavailable = new EventQueue({ read() { throw new Error('blocked'); }, write() { throw new Error('blocked'); } });
    expect(() => unavailable.add({ ...fixture(), occurredAt: new Date().toISOString() })).not.toThrow();
  });
});
