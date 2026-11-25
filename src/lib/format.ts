export const TZ = () => process.env.APP_TIMEZONE ?? "America/Toronto";

export function fmtDateTime(d: Date, tz = TZ()) {
  return new Intl.DateTimeFormat("en-CA", { dateStyle: "medium", timeStyle: "short", timeZone: tz }).format(d);
}
export function fmtDate(d: Date, tz = TZ()) {
  return new Intl.DateTimeFormat("en-CA", { dateStyle: "medium", timeZone: tz }).format(d);
}
export function fmtTime(d: Date, tz = TZ()) {
  return new Intl.DateTimeFormat("en-CA", { timeStyle: "short", timeZone: tz }).format(d);
}

export function relTime(d: Date | null | undefined, now = Date.now()) {
  if (!d) return "-";
  const s = Math.max(0, Math.floor((now - d.getTime()) / 1000));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`;
  const days = Math.floor(h / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

/** Midnight at the start of a YYYY-MM-DD date in the app timezone, or null if the text is not a date. */
export function startOfDay(ymd: string | undefined, tz = TZ()): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd ?? "");
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]) - 1, Number(m[3])];
  for (const off of [0, 1, 2, 3, 4, 5, 6, 7, 8]) {
    const c = new Date(Date.UTC(y, mo, d, off));
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(c);
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
    if (get("year") === y && get("month") === mo + 1 && get("day") === d && get("hour") === 0) return c;
  }
  return null;
}
