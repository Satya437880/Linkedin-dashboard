/** Name comparison that survives LinkedIn's decorations: pronouns, credentials, degrees, punctuation. */

const NOISE = new Set(["he", "him", "she", "her", "they", "them", "his", "hers", "mr", "mrs", "ms", "dr", "jr", "sr", "st", "you", "the", "and", "pe", "peng", "phd", "mba", "cpa", "pmp", "eng"]);

export function nameTokens(s: string): string[] {
  return (s ?? "")
    .toLowerCase()
    .replace(/\(.*?\)/g, " ") // (He/Him) and similar
    .split(/[,|·•]/)[0] // credentials after a comma
    .replace(/[^a-zÀ-ɏ\s'-]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !NOISE.has(t));
}

/** True when two names are plausibly the same person: one is contained in the other, or first and last match. */
export function sameNameLoose(a: string, b: string): boolean {
  const x = nameTokens(a);
  const y = nameTokens(b);
  if (!x.length || !y.length) return false;
  if (x.every((t) => y.includes(t)) || y.every((t) => x.includes(t))) return true;
  return x[0] === y[0] && x[x.length - 1] === y[y.length - 1];
}

/** Your own name from LinkedIn's top navigation photo (alt text), if the page shows it. */
export function detectOwnName(doc: Document): string | null {
  const alt = doc.querySelector<HTMLImageElement>("img.global-nav__me-photo, .global-nav__me img")?.getAttribute("alt") ?? "";
  const cleaned = alt.replace(/^(photo of|profile photo of|picture of)\s+/i, "").trim();
  return cleaned && cleaned.length < 80 ? cleaned : null;
}

export type Direction = "inbound" | "outbound";

/**
 * Who wrote a message? `who` is the sender name shown above it.
 * Matches the conversation partner first, then your own name; if neither is known the other side is assumed.
 */
export function decideDirection(who: string, partner: string, own: string | null): Direction {
  const theirs = sameNameLoose(who, partner);
  const mine = own ? sameNameLoose(who, own) : false;
  if (mine && !theirs) return "outbound";
  if (theirs && !mine) return "inbound";
  if (theirs && mine) return "inbound"; // identical names (testing against yourself): prefer the partner reading
  // Neither matched: with your own name known, anyone else in a one-to-one thread is the partner.
  return own ? "inbound" : "outbound";
}
