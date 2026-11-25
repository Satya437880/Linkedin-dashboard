import { and, asc, eq, lte } from "drizzle-orm";
import { getBundle, type DbBundle } from "../db/client";
import { jobs } from "../db/schema";
import { classifyProspect, draftReplyForProspect, nextActionForProspect, summarizeProspect } from "../ai/analyze";

export type JobHandler = (b: DbBundle, payload: unknown) => Promise<void> | void;

const pid = (p: unknown) => (p as { prospectId: number }).prospectId;

/** Job types without a handler (e.g. enrich_company until Phase 2) stay pending; nothing is lost. */
export const handlers: Record<string, JobHandler> = {
  classify_intent: (b, p) => classifyProspect(b, pid(p)),
  summarize_conversation: (b, p) => summarizeProspect(b, pid(p)),
  next_best_action: (b, p) => nextActionForProspect(b, pid(p)),
  draft_reply: (b, p) => draftReplyForProspect(b, pid(p)),
};

const MAX_ATTEMPTS = 5;
export const backoffMs = (attempt: number) => Math.min(60_000 * 2 ** (attempt - 1), 6 * 3_600_000);

/** Runs at most one due job. Returns true if a job was processed. */
export async function runNextJob(b: DbBundle, now = new Date()): Promise<boolean> {
  const types = Object.keys(handlers);
  if (types.length === 0) return false;
  const due = (
    await b.db
      .select()
      .from(jobs)
      .where(and(eq(jobs.status, "pending"), lte(jobs.runAfter, now)))
      .orderBy(asc(jobs.id))
  ).find((j) => handlers[j.type]);
  if (!due) return false;

  await b.db.update(jobs).set({ status: "running", attempts: due.attempts + 1 }).where(eq(jobs.id, due.id));
  try {
    await handlers[due.type](b, due.payload);
    await b.db.update(jobs).set({ status: "done", lastError: null }).where(eq(jobs.id, due.id));
  } catch (e) {
    const attempts = due.attempts + 1;
    const msg = e instanceof Error ? e.message : String(e);
    if (attempts >= MAX_ATTEMPTS) {
      await b.db.update(jobs).set({ status: "failed", lastError: msg }).where(eq(jobs.id, due.id));
    } else {
      await b.db
        .update(jobs)
        .set({ status: "pending", lastError: msg, runAfter: new Date(now.getTime() + backoffMs(attempts)) })
        .where(eq(jobs.id, due.id));
    }
  }
  return true;
}

/**
 * Serverless has no long-lived timer, so jobs are drained on demand: after each ingest, and by the cron route.
 * Stops after maxJobs or maxMs so a request never runs past the function time limit.
 */
export async function drainJobs(b: DbBundle = getBundle(), opts: { maxJobs?: number; maxMs?: number } = {}): Promise<number> {
  const { maxJobs = 25, maxMs = 8_000 } = opts;
  const started = Date.now();
  let n = 0;
  while (n < maxJobs && Date.now() - started < maxMs && (await runNextJob(b))) n++;
  return n;
}
