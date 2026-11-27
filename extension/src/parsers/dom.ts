/**
 * Fallback: read the visible classic thread from the page when no JSON was seen.
 * Selectors are guesses at LinkedIn's current class names, kept together here so they are quick to fix.
 */
import { cleanHeadline, cleanName } from "../shared/clean";
import { decideDirection, detectOwnName } from "../shared/names";
import type { IngestEvent } from "../shared/types";

export const SELECTORS = {
  headerName: ".msg-entity-lockup__entity-title, .msg-thread__link-to-profile",
  headerLink: "a.msg-thread__link-to-profile, .msg-entity-lockup a[href*='/in/']",
  headerHeadline: ".msg-entity-lockup__entity-info",
  event: "li.msg-s-message-list__event",
  dateHeading: ".msg-s-message-list__time-heading",
  group: ".msg-s-message-group",
  senderName: ".msg-s-message-group__name",
  time: ".msg-s-message-group__timestamp, time:not(.msg-s-message-list__time-heading)",
  body: ".msg-s-event-listitem__body",
  attachment: "[class*='msg-s-event-listitem__'][class*='attachment'], [class*='msg-s-event-listitem__'][class*='image'], [class*='msg-s-event-listitem__'][class*='audio'], [class*='msg-s-event-listitem__'][class*='video']",
};

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

export function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/** "Today", "Yesterday", "Mon", "Nov 15", "Nov 15, 2026" -> local midnight Date. */
export function parseDateHeading(text: string, now: Date): Date | null {
  const t = text.trim().toLowerCase();
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (t === "today") return d;
  if (t === "yesterday") return new Date(d.getTime() - 86_400_000);
  const wd = DAYS.indexOf(t.slice(0, 3));
  if (wd >= 0 && t.length <= 9 && !/\d/.test(t)) {
    const diff = (d.getDay() - wd + 7) % 7 || 7;
    return new Date(d.getTime() - diff * 86_400_000);
  }
  const m = /^([a-z]{3})[a-z]*\.?\s+(\d{1,2})(?:,?\s+(\d{4}))?$/.exec(t);
  if (m && MONTHS.includes(m[1])) return new Date(m[3] ? Number(m[3]) : now.getFullYear(), MONTHS.indexOf(m[1]), Number(m[2]));
  return null;
}

/** "3:40 PM" onto a date. */
export function applyTime(date: Date, text: string): Date | null {
  const m = /(\d{1,2}):(\d{2})\s*([AP]M)?/i.exec(text);
  if (!m) return null;
  let h = Number(m[1]);
  const pm = m[3]?.toUpperCase() === "PM";
  if (m[3]) h = (h % 12) + (pm ? 12 : 0);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), h, Number(m[2]));
}

export function parseClassicDom(doc: Document, url: string, now = new Date(), ownName?: string | null): IngestEvent[] {
  const own = (ownName && ownName.trim()) || detectOwnName(doc);
  const threadMatch = /\/messaging\/thread\/([^/?#]+)/.exec(url);
  if (!threadMatch) return [];
  const threadId = threadMatch[1];
  const nameRaw = doc.querySelector(SELECTORS.headerName)?.textContent ?? "";
  const name = cleanName(nameRaw);
  if (!name) return [];
  const link = doc.querySelector<HTMLAnchorElement>(SELECTORS.headerLink)?.getAttribute("href") ?? "";
  const slug = /\/in\/([^/?#]+)/.exec(link)?.[1] ?? `dom:${name.toLowerCase().replace(/\s+/g, "-")}`;
  const headline = cleanHeadline(doc.querySelector(SELECTORS.headerHeadline)?.textContent, nameRaw);
  const sender = {
    providerUserId: slug,
    fullName: name,
    headline,
    photoUrl: null,
    linkedinUrl: slug.startsWith("dom:") ? null : `https://www.linkedin.com/in/${slug}`,
  };

  // Every visible message is kept. When LinkedIn has not shown a date, name or time for one, the closest known
  // value stands in rather than the message being dropped.
  const items = Array.from(doc.querySelectorAll(SELECTORS.event)).map((el) => {
    const heading = el.querySelector(SELECTORS.dateHeading)?.textContent;
    return { el, date: heading ? parseDateHeading(heading, now) : null };
  });
  const firstDate = items.find((i) => i.date)?.date ?? new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const events: IngestEvent[] = [];
  const seen = new Map<string, number>();
  let day: Date | null = null;
  let who = "";
  let clock = "";
  for (const { el, date } of items) {
    if (date) day = date;
    const n = cleanName(el.querySelector(SELECTORS.senderName)?.textContent);
    if (n) who = n;
    const tm = el.querySelector(SELECTORS.time)?.textContent?.trim();
    if (tm) clock = tm;
    const texts = Array.from(el.querySelectorAll(SELECTORS.body)).map((b) => b.textContent?.trim() ?? "").filter(Boolean);
    if (!texts.length && el.querySelector(SELECTORS.attachment)) texts.push("[attachment]");
    for (const text of texts) {
      const timed = applyTime(day ?? firstDate, clock);
      const sentAt = (timed ?? day ?? firstDate).toISOString();
      // A guessed date changes from day to day, so it stays out of the id: otherwise each visit would add a copy.
      const base = hash(day && timed ? `${sentAt}|${text}` : `?|${clock}|${text}`);
      const nth = (seen.get(base) ?? 0) + 1;
      seen.set(base, nth);
      events.push({
        source: "extension",
        eventType: "message.new",
        externalMessageId: `dom:${threadId}:${base}${nth > 1 ? `:${nth}` : ""}`,
        externalThreadId: threadId,
        inbox: "classic",
        direction: decideDirection(who, name, own),
        text,
        sentAt,
        sender,
        threadUrl: `https://www.linkedin.com/messaging/thread/${threadId}/`,
      });
    }
  }
  return events;
}
