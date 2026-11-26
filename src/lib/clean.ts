/**
 * LinkedIn pages hide accessibility text such as "Status is offline" inside name and headline elements.
 * Scraped text arrives as several whitespace-separated lines; these helpers keep only the real content.
 */

export function cleanLines(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter((l) => l && !/^status is /i.test(l));
}

/** First real line is the person's name. */
export function cleanName(raw: string | null | undefined): string {
  return cleanLines(raw)[0] ?? "";
}

/** Headline from its own field, or whatever followed the name in the same element. */
export function cleanHeadline(headline: string | null | undefined, nameField?: string | null): string | null {
  const own = cleanLines(headline).join(" ").trim();
  if (own) return own;
  const rest = cleanLines(nameField).slice(1).join(" ").trim();
  return rest || null;
}

/** The stock connection note ("Hi Andre, I came across your profile ... to connect.") is not a real message, so views skip it. */
export function isConnectNote(text: string): boolean {
  const t = text.replace(/\s+/g, " ").trim();
  return /^hi\b[^.!?]{0,60}?\bI came across your profile and thought it would be great to connect[.!]?$/i.test(t);
}
