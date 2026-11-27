/** What kind of LinkedIn page is this? Drives what the extension can read and what the status pill says. */
export type PageKind = "classic-thread" | "classic-list" | "salesnav" | "other";

export function pageKind(pathname: string): PageKind {
  if (/^\/messaging\/thread\//.test(pathname)) return "classic-thread";
  if (/^\/messaging\/?/.test(pathname)) return "classic-list";
  if (/^\/sales\/inbox/.test(pathname)) return "salesnav";
  return "other";
}

/** One-line explanation shown on the pill. */
export function pillStatus(kind: PageKind, readNow: number | null): string {
  switch (kind) {
    case "classic-thread":
      return readNow === null ? "reading this chat..." : readNow > 0 ? `${readNow} messages read from this chat` : "no messages found on this page";
    case "classic-list": return "open a chat to read it";
    case "salesnav": return "Sales Navigator chats cannot be read yet";
    default: return "not a messaging page";
  }
}
