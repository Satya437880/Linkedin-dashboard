import type { Config, IngestEvent, Stats } from "../shared/types";

export interface KV {
  get<T>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown): Promise<void>;
}

type FetchFn = (url: string, init: RequestInit) => Promise<Response>;

const QUEUE = "queue";
const DEAD = "deadLetter";
const STATS = "stats";
const EMPTY_STATS: Stats = { read: 0, sent: 0, lastSentAt: null, lastError: null };

/**
 * Persistent outbound queue. An event leaves the queue only after the app answers 2xx.
 * Network errors, 401 and 5xx keep it queued for a later retry. 4xx validation errors are moved
 * to a dead-letter list (kept, never dropped) so one bad event cannot block the rest.
 */
export class EventQueue {
  private flushing = false;
  private chain: Promise<unknown> = Promise.resolve();
  constructor(private kv: KV, private fetchFn: FetchFn = (u, i) => fetch(u, i)) {}

  private async stats(): Promise<Stats> {
    return { ...EMPTY_STATS, ...((await this.kv.get<Stats>(STATS)) ?? {}) };
  }

  /** Runs one change to the stored queue at a time, so two of them cannot overwrite each other. */
  private locked<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.chain.then(fn);
    this.chain = run.catch(() => undefined);
    return run;
  }

  async enqueue(events: IngestEvent[]): Promise<number> {
    if (events.length === 0) return 0;
    return this.locked(() => this.append(events));
  }

  private async append(events: IngestEvent[]): Promise<number> {
    const queue = (await this.kv.get<IngestEvent[]>(QUEUE)) ?? [];
    const seen = new Set(queue.map((e) => e.externalMessageId));
    const fresh = events.filter((e) => !seen.has(e.externalMessageId));
    // Persist before anything else so a crash right after cannot lose the events.
    await this.kv.set(QUEUE, [...queue, ...fresh]);
    const s = await this.stats();
    await this.kv.set(STATS, { ...s, read: s.read + fresh.length });
    return fresh.length;
  }

  /** Removes the event just handled. Reads the queue again: more may have arrived while it was being sent. */
  private dropFirst() {
    return this.locked(async () => {
      const queue = (await this.kv.get<IngestEvent[]>(QUEUE)) ?? [];
      await this.kv.set(QUEUE, queue.slice(1));
    });
  }

  async status() {
    const queue = (await this.kv.get<IngestEvent[]>(QUEUE)) ?? [];
    const dead = (await this.kv.get<IngestEvent[]>(DEAD)) ?? [];
    return { ...(await this.stats()), queued: queue.length, deadLetters: dead.length };
  }

  /** Sends queued events in order. Stops at the first transient failure. Returns number sent. */
  async flush(config: Config): Promise<number> {
    if (this.flushing) return 0;
    this.flushing = true;
    let sent = 0;
    try {
      if (!config.token) {
        await this.fail("Set the ingest token in the extension options.");
        return 0;
      }
      const url = `${config.appUrl.replace(/\/$/, "")}/api/ingest`;
      for (;;) {
        const queue = (await this.kv.get<IngestEvent[]>(QUEUE)) ?? [];
        const next = queue[0];
        if (!next) {
          // Token is set and nothing is waiting: an earlier error (e.g. a missing token) is out of date.
          const s = await this.stats();
          if (s.lastError) await this.kv.set(STATS, { ...s, lastError: null });
          break;
        }
        let res: Response;
        try {
          res = await this.fetchFn(url, {
            method: "POST",
            headers: { "content-type": "application/json", "x-ingest-token": config.token },
            body: JSON.stringify(next),
          });
        } catch {
          await this.fail("App not reachable. Will retry.");
          break;
        }
        if (res.ok) {
          await this.dropFirst();
          const s = await this.stats();
          await this.kv.set(STATS, { ...s, sent: s.sent + 1, lastSentAt: new Date().toISOString(), lastError: null });
          sent++;
        } else if (res.status === 400) {
          const dead = (await this.kv.get<IngestEvent[]>(DEAD)) ?? [];
          await this.kv.set(DEAD, [...dead, next]);
          await this.dropFirst();
          await this.fail("An event was rejected as invalid and set aside.");
        } else {
          await this.fail(res.status === 401 ? "Wrong ingest token (401)." : `App returned ${res.status}. Will retry.`);
          break;
        }
      }
    } finally {
      this.flushing = false;
    }
    return sent;
  }

  private async fail(message: string) {
    const s = await this.stats();
    await this.kv.set(STATS, { ...s, lastError: message });
  }
}
