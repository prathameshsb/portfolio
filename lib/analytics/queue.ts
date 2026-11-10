import type { EventInput } from './schema';

const MAX_EVENTS = 100;
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const MAX_ATTEMPTS = 6;

export interface QueueStorage {
  read(): string | null;
  write(value: string): void;
}

export interface EventAcknowledgement {
  accepted: string[];
  duplicates: string[];
  ignored?: string[];
}

export class EventQueue {
  private events: EventInput[] = [];
  private sending = false;
  private attempts = 0;

  constructor(private readonly storage: QueueStorage, private readonly clock = Date.now) {
    try {
      const raw = storage.read();
      if (raw && raw.length < 100_000) {
        const saved: unknown = JSON.parse(raw);
        if (Array.isArray(saved)) {
          this.events = saved.filter((event): event is EventInput =>
            !!event && typeof event === 'object' && typeof event.eventId === 'string' &&
            typeof event.occurredAt === 'string' && typeof event.route === 'string' &&
            typeof event.sessionId === 'string' && typeof event.type === 'string',
          ).slice(-MAX_EVENTS);
        }
      }
    } catch {
      this.events = [];
    }
    this.prune();
  }

  add(event: EventInput) {
    this.prune();
    const timestamp = Date.parse(event.occurredAt);
    if (!Number.isFinite(timestamp) || timestamp > this.clock() + 60_000 || this.clock() - timestamp > MAX_AGE_MS) return;
    if (!this.events.some((queued) => queued.eventId === event.eventId)) {
      this.events = [...this.events, event].slice(-MAX_EVENTS);
    }
    this.persist();
  }

  get pending() { return this.events.length; }
  get exhausted() { return this.attempts >= MAX_ATTEMPTS; }
  get retryDelay() { return Math.min(60_000, 1000 * 2 ** this.attempts); }

  resume() { this.attempts = 0; }

  async flush(send: (events: EventInput[]) => Promise<EventAcknowledgement>): Promise<boolean> {
    if (this.sending || this.exhausted) return false;
    this.prune();
    if (!this.events.length) return true;
    const batch = this.events.slice(0, 20);
    const batchIds = new Set(batch.map((event) => event.eventId));
    this.sending = true;
    try {
      const acknowledgement = await send(batch);
      if (!Array.isArray(acknowledgement.accepted) || !Array.isArray(acknowledgement.duplicates) || (acknowledgement.ignored !== undefined && !Array.isArray(acknowledgement.ignored))) {
        throw new Error('Invalid acknowledgement');
      }
      const received = new Set([...acknowledgement.accepted, ...acknowledgement.duplicates, ...(acknowledgement.ignored ?? [])].filter((id) => batchIds.has(id)));
      this.events = this.events.filter((event) => !received.has(event.eventId));
      this.persist();
      if (!received.size) throw new Error('No persisted events acknowledged');
      this.attempts = 0;
      return true;
    } catch {
      this.attempts += 1;
      return false;
    } finally {
      this.sending = false;
    }
  }

  clear() { this.events = []; this.persist(); }

  private prune() {
    const now = this.clock();
    this.events = this.events.filter((event) => {
      const timestamp = Date.parse(event.occurredAt);
      return timestamp <= now + 60_000 && now - timestamp <= MAX_AGE_MS;
    });
    this.persist();
  }

  private persist() {
    try { this.storage.write(JSON.stringify(this.events)); } catch { /* Storage can be unavailable in private browsing. */ }
  }
}
