export const DEFAULT_BANNED = ["delve", "leverage", "synergy", "cutting-edge", "game-changer", "unlock", "seamless"];

export type DraftCheck = { ok: true } | { ok: false; problems: string[] };

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function checkDraft(text: string, banned: string[] = DEFAULT_BANNED): DraftCheck {
  const problems: string[] = [];
  if (text.includes("—")) problems.push("contains an em dash");
  for (const w of banned) {
    if (new RegExp(`\\b${escapeRe(w)}\\b`, "i").test(text)) problems.push(`contains banned word "${w}"`);
  }
  return problems.length ? { ok: false, problems } : { ok: true };
}
