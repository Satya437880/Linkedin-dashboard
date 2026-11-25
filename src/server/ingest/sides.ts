/**
 * Decides who wrote a message in a one-to-one LinkedIn thread from its wording alone.
 * Used only to repair messages saved with the wrong side. Returns null when the text does not say.
 *
 * Ours: greets the client by first name, addresses them directly, mentions Maple MPSS, carries our sign-off.
 * Theirs: addresses us by name, answers our outreach, or is a short reply with none of those marks.
 */

// Ways people spell the account owner's first name, plus the surname.
const OUR_NAMES = ["prrithive", "prithive", "prithvi", "prithhive", "preithive", "prithuve", "prithvie", "prrithvi", "prithiv", "sridharan", "thakkum"];
const OUR_NAME_RE = new RegExp(`(${OUR_NAMES.join("|")})`, "gi");

export type Side = "ours" | "client";
export type Verdict = { side: Side; why: string } | null;

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** First usable name token: "Ed Hunt, R.I.B. (Ont)" -> "ed", "SWAMI NAIR" -> "swami". */
export function firstNameOf(full: string): string {
  const t = full.split(",")[0].replace(/\(.*?\)/g, " ").trim().split(/\s+/).find((w) => /^[A-Za-zÀ-ɏ'-]{2,}$/.test(w)) ?? "";
  return t.toLowerCase();
}

/** Where our name appears, tolerating a name stuck to the next sentence ("PrrithiveThank you"). */
function ourNameAt(text: string): { index: number; end: number } | null {
  OUR_NAME_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = OUR_NAME_RE.exec(text))) {
    const before = text[m.index - 1] ?? " ";
    const after = text[m.index + m[0].length] ?? " ";
    if (/[A-Za-z]/.test(before)) continue; // inside another word
    if (/[a-z]/.test(after)) continue; // "Prithivesomething"; a capital next letter is a stuck sentence start
    return { index: m.index, end: m.index + m[0].length };
  }
  return null;
}

const GREET = "(?:hi|hello|hey|dear|good (?:morning|afternoon|evening)|greetings)";
const ANSWERS_OUTREACH = /\b(?:thanks|thank you) for (?:reaching out|connecting|your message|the message|getting in touch|contacting)\b/i;
// Openers that could equally be ours (we propose, we ask); never guess these from brevity.
const PROPOSAL = /^(?:how about|what about|would|does|do you|shall|can we|could we|let'?s|let us|please|will you)\b/i;

export function whoWrote(textRaw: string, clientFull: string): Verdict {
  const text = textRaw.replace(/\s+/g, " ").trim();
  if (!text) return null;
  const first = firstNameOf(clientFull);
  const f = first ? esc(first) : "";
  const us = ourNameAt(text);

  // ---- marks of OUR messages
  if (f && new RegExp(`^${GREET}[\\s,.!]*${f}\\b`, "i").test(text)) return { side: "ours", why: "greets the client by name" };
  if (/\bgreetings for the day\b/i.test(text)) return { side: "ours", why: "our opening line" };
  if (/\b(?:best|kind|warm) regards\b/i.test(text) && ourNameAt(text.slice(-120))) return { side: "ours", why: "our sign-off" };
  if (f && new RegExp(`^(?:thanks|thank you)(?: so much)?(?: for [^,.!]{1,50})?[\\s,.!]+${f}\\b`, "i").test(text)) return { side: "ours", why: "thanks the client by name" };
  if (/\bmaple mpss\b/i.test(text) && !(us && us.index < 40)) return { side: "ours", why: "mentions our company" };

  // ---- marks of THEIR messages
  if (us && us.index < 25) return { side: "client", why: "addresses us by name" };
  if (us && !(f && new RegExp(`\\b${f}\\b`, "i").test(text))) return { side: "client", why: "mentions us by name" };
  if (ANSWERS_OUTREACH.test(text)) return { side: "client", why: "answers our outreach" };

  // ---- the client's name inside the text, not as a sign-off, means we are speaking to them
  if (f) {
    const m = new RegExp(`\\b${f}\\b`, "i").exec(text);
    if (m && m.index < text.length - Math.max(20, first.length + 12)) return { side: "ours", why: "addresses the client by name" };
    if (m) return { side: "client", why: "signed with their own name" };
  }

  // ---- short replies without any of the marks above are the client's, unless they read like our proposals
  if (text.length <= 60 && !PROPOSAL.test(text)) return { side: "client", why: "short reply" };
  return null;
}
