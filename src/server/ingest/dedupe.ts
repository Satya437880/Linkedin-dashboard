import { and, eq, isNull, like } from "drizzle-orm";
import type { DbBundle } from "../db/client";
import { messages } from "../db/schema";

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");

/**
 * A reply imported from your sheet and the same reply read from the real conversation are one message.
 * The real one has the true time, so the sheet copy is marked as a duplicate of it. Nothing is deleted.
 * A sheet reply counts as repeated when one real message contains it, or when real messages cover most of it
 * (long replies are read line by line from the page).
 */
export async function markSheetDuplicates(b: DbBundle, prospectId?: number): Promise<number> {
  const where = and(like(messages.externalMessageId, "sheet-%"), eq(messages.direction, "inbound"), isNull(messages.duplicateOf), prospectId ? eq(messages.prospectId, prospectId) : undefined);
  let marked = 0;
  for (const s of await b.db.select().from(messages).where(where)) {
    const t = norm(s.text);
    if (t.length < 8) continue;
    const real = await b.db
      .select()
      .from(messages)
      .where(and(eq(messages.prospectId, s.prospectId), like(messages.externalMessageId, "dom:%"), eq(messages.direction, "inbound"), isNull(messages.duplicateOf)));
    let original = real.find((r) => norm(r.text).includes(t));
    if (!original) {
      const parts = real.filter((r) => { const n = norm(r.text); return n.length >= 8 && t.includes(n); });
      const covered = parts.reduce((sum, r) => sum + norm(r.text).length, 0);
      if (parts.length && covered / t.length >= 0.6) original = parts.sort((x, y) => x.sentAt.getTime() - y.sentAt.getTime())[0];
    }
    if (original) {
      await b.db.update(messages).set({ duplicateOf: original.id }).where(eq(messages.id, s.id));
      marked++;
    }
  }
  return marked;
}
