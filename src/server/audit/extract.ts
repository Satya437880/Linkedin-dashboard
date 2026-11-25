import { z } from "zod";

/** Everything the Audit tab can hold for a prospect. Every field is optional; empty means "not provided". */
export const extractedSchema = z.object({
  person: z.string().nullish(),
  linkedin: z.string().nullish(),
  designation: z.string().nullish(),
  company: z.string().nullish(),
  overview: z.array(z.string()).nullish(),
  website: z.string().nullish(),
  industry: z.string().nullish(),
  location: z.string().nullish(),
  address: z.string().nullish(),
  contact: z.string().nullish(),
  findings: z.array(z.string()).nullish(),
  recommendations: z.array(z.string()).nullish(),
  issues: z.array(z.string()).nullish(),
  painPoints: z.array(z.string()).nullish(),
  requirements: z.array(z.string()).nullish(),
  notes: z.string().nullish(),
});
export type Extracted = z.infer<typeof extractedSchema>;
export type FieldKey = keyof Extracted;

export const SCALAR_FIELDS = ["person", "linkedin", "designation", "company", "website", "industry", "location", "address", "contact", "notes"] as const;
export const LIST_FIELDS = ["overview", "findings", "recommendations", "issues", "painPoints", "requirements"] as const;
export const ALL_FIELDS = [...SCALAR_FIELDS, ...LIST_FIELDS] as FieldKey[];

export const FIELD_LABEL: Record<FieldKey, string> = {
  person: "Person",
  linkedin: "LinkedIn",
  designation: "Designation",
  company: "Company",
  overview: "Company overview",
  website: "Website",
  industry: "Industry",
  location: "Location",
  address: "Company address",
  contact: "Contact information",
  findings: "Audit findings",
  recommendations: "Recommendations",
  issues: "Issues",
  painPoints: "Pain points",
  requirements: "Requirements",
  notes: "Notes",
};

/** Header / label synonyms, matched after lowercasing and removing punctuation. */
export const SYNONYMS: Record<FieldKey, string[]> = {
  person: ["person", "name", "prospect", "full name", "client name", "contact name", "prospect name"],
  linkedin: ["linkedin", "linkedin url", "linkedin profile", "linkedin link", "profile", "profile url"],
  designation: ["designation", "title", "job title", "position", "role", "job"],
  company: ["company", "company name", "organization", "organisation", "employer", "account"],
  overview: ["company overview", "overview", "about company", "about the company", "company description", "company summary", "about", "description"],
  website: ["website", "web site", "site", "company website", "url", "domain", "web"],
  industry: ["industry", "sector", "vertical"],
  location: ["location", "based in", "city", "region"],
  address: ["address", "company address", "headquarters", "head office", "hq", "office address"],
  contact: ["contact information", "contact info", "contact", "contact details", "email", "e mail", "email address", "phone", "phone number", "mobile", "telephone"],
  findings: ["audit findings", "findings", "audit", "audit notes", "observations", "audit summary"],
  recommendations: ["recommendations", "recommendation", "suggestions", "suggested actions", "action items"],
  issues: ["issues", "issue", "problems", "problem"],
  painPoints: ["pain points", "pain point", "challenges", "pains"],
  requirements: ["requirements", "requirement", "needs", "client needs", "what they need"],
  notes: ["notes", "note", "meeting notes", "comments", "remarks", "additional notes"],
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
const LOOKUP = new Map<string, FieldKey>();
for (const [k, list] of Object.entries(SYNONYMS) as [FieldKey, string[]][]) for (const s of list) if (!LOOKUP.has(norm(s))) LOOKUP.set(norm(s), k);

/** Maps a header or label to a field, or null. */
export function fieldForLabel(label: string): FieldKey | null {
  return LOOKUP.get(norm(label)) ?? null;
}

const BULLET = /^\s*(?:[-*•●▪–]|\d{1,2}[.)])\s+/;

/** Splits a multi-value cell or block into clean points. */
export function toPoints(text: string): string[] {
  return text
    .split(/\r?\n|\s\|\s|;\s+/)
    .map((l) => l.replace(BULLET, "").trim())
    .filter(Boolean);
}

const URL_RE = /https?:\/\/[^\s<>")\]]+/gi;
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE_RE = /(?:\+?\d[\d\s().-]{8,}\d)/g;

const clean = (s: string | undefined | null) => (s ?? "").replace(/\s+/g, " ").trim();

/** "n/a", "none", "-" and similar mean the field is empty. */
export const isPlaceholder = (s: string) => /^(?:n\/?a|none|nil|null|tbd|tba|unknown|not (?:available|provided|found)|-+|\?+)\.?$/i.test(s.trim());

/** Empty extraction result used to detect "nothing found". */
export function isEmptyExtract(e: Extracted): boolean {
  return ALL_FIELDS.every((k) => {
    const v = e[k];
    return Array.isArray(v) ? v.length === 0 : !v;
  });
}

/**
 * Rules extraction: works on labelled text ("Person:", "Audit Findings:", markdown headings) and
 * falls back to patterns for unlabelled text (links, emails, phones, "Title at Company").
 * Text that fits no field is kept in Notes so nothing is lost.
 */
export function extractFromText(input: string): Extracted {
  const text = input.replace(/\r\n/g, "\n").replace(/ /g, " ");
  const lines = text.split("\n");
  const buckets = new Map<FieldKey, string[]>();
  const preamble: string[] = [];
  let current: FieldKey | null = null;

  // "Label: value" or "## Label" or "**Label**:"
  const labelLine = /^\s*(?:#{1,6}\s*)?(?:[-*•]\s*)?(?:\*\*|__)?([A-Za-z][A-Za-z0-9 /&'-]{1,40}?)(?:\*\*|__)?\s*(?::|–|—)\s*(.*)$/;
  const headingOnly = /^\s*#{1,6}\s*(.+?)\s*#*\s*$/;

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) { if (current) buckets.get(current)?.push(""); continue; }
    let label: string | null = null;
    let rest = "";
    const m = labelLine.exec(line);
    if (m && fieldForLabel(m[1])) { label = m[1]; rest = m[2]; }
    else {
      const h = headingOnly.exec(line);
      if (h && fieldForLabel(h[1].replace(/:$/, ""))) { label = h[1].replace(/:$/, ""); rest = ""; }
    }
    if (label) {
      current = fieldForLabel(label)!;
      if (!buckets.has(current)) buckets.set(current, []);
      if (rest.trim()) buckets.get(current)!.push(rest.trim());
    } else if (current) {
      buckets.get(current)!.push(line.trim());
    } else {
      preamble.push(line.trim());
    }
  }

  const out: Extracted = {};
  const body = (k: FieldKey) => (buckets.get(k) ?? []).join("\n").trim();

  for (const k of SCALAR_FIELDS) {
    const b = body(k);
    if (!b) continue;
    const v = k === "notes" || k === "contact" ? b : clean(b.split("\n")[0]);
    if (!isPlaceholder(v)) out[k] = v;
  }
  for (const k of LIST_FIELDS) {
    const pts = toPoints(body(k)).filter((p) => !isPlaceholder(p));
    if (pts.length) out[k] = pts;
  }

  // ---- unlabelled fallbacks, only for fields that are still empty ----
  const allUrls = text.match(URL_RE) ?? [];
  if (!out.linkedin) {
    const li = allUrls.find((u) => /linkedin\.com\/(in|sales\/(lead|people)|company)\//i.test(u));
    if (li) out.linkedin = li.replace(/[.,;]+$/, "");
  }
  if (!out.website) {
    const site = allUrls.find((u) => !/linkedin\.com/i.test(u));
    const bare = !site ? /\b(?:www\.)[a-z0-9-]+(?:\.[a-z0-9-]+)+\b/i.exec(text.replace(EMAIL_RE, ""))?.[0] : null;
    if (site) out.website = site.replace(/[.,;]+$/, "");
    else if (bare) out.website = `https://${bare}`;
  }
  if (!out.contact) {
    const found = [...new Set([...(text.match(EMAIL_RE) ?? []), ...((text.match(PHONE_RE) ?? []).filter((p) => p.replace(/\D/g, "").length >= 10).map((p) => p.trim()))])];
    if (found.length) out.contact = found.join("\n");
  }
  const usedLines = new Set<string>();
  if (!out.designation || !out.company) {
    const pool = (preamble.length ? preamble : lines.map((l) => l.trim())).filter(Boolean).slice(0, 6);
    for (const l of pool) {
      const m = /^([A-Z][A-Za-z&/,.' -]{2,60}?)\s+(?:at|@)\s+([A-Z][A-Za-z0-9&.,'() -]{1,60})$/.exec(l);
      if (!m) continue;
      if (!out.designation) out.designation = clean(m[1]);
      if (!out.company) out.company = clean(m[2]);
      usedLines.add(l);
      break;
    }
  }
  if (!out.person && preamble.length) {
    const first = preamble[0].replace(/^[#*\s]+|[*\s]+$/g, "");
    if (/^[A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+){1,3}(?:,.*)?$/.test(first) && !/\bat\b/.test(first)) out.person = clean(first.split(",")[0]);
  }

  // Keep leftover unlabelled text so nothing is lost.
  const used = new Set<string>(allUrls);
  const leftover = preamble
    .filter((l) => l && !used.has(l) && !(out.person && l.startsWith(out.person)) && !usedLines.has(l) && !EMAIL_RE.test(l) && !URL_RE.test(l))
    .join("\n")
    .trim();
  EMAIL_RE.lastIndex = 0;
  URL_RE.lastIndex = 0;
  if (leftover) out.notes = out.notes ? `${out.notes}\n${leftover}` : leftover;

  return tidy(out);
}

/** Splits decorations out of the values: "(based in X)" after a name, a street address after a company, a company after a title. */
export function tidy(e: Extracted): Extracted {
  const out = { ...e };
  if (out.person) {
    const m = /^(.*?)\s*\((?:based|located|living)\s+in\s+([^)]+)\)\s*$/i.exec(out.person);
    if (m) { out.person = clean(m[1]); if (!out.location) out.location = clean(m[2]); }
  }
  if (out.company) {
    const m = /^([^,]+?),\s*(\d.*)$/.exec(out.company); // "Acme Ltd, 2600 South Sheridan Way, Mississauga"
    if (m) { out.company = clean(m[1]); if (!out.address) out.address = clean(m[2]); }
  }
  if (out.designation && out.company) {
    const suffix = new RegExp(`,?\\s*(?:at\\s+)?${out.company.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "i");
    const stripped = out.designation.replace(suffix, "").trim();
    if (stripped) out.designation = stripped;
  }
  return out;
}

// ---------- Optional local AI (Ollama) for text the rules could not structure ----------

export const PROMPT_VERSION = "extract-v1";

const SYSTEM = [
  "You extract structured prospect research from raw text. Reply with JSON only.",
  "Use ONLY facts stated in the text. If a field is not stated, use null (or [] for lists). Never invent facts.",
  "Keys: person, linkedin, designation, company, overview (array), website, industry, contact, findings (array), recommendations (array), issues (array), painPoints (array), requirements (array), notes.",
].join(" ");

type FetchFn = typeof fetch;

/** Asks the local model to fill ONLY the fields the rules left empty. Returns {} on any failure. */
export async function extractWithModel(text: string, have: Extracted, opts: { url: string; model: string; fetchFn?: FetchFn; timeoutMs?: number }): Promise<{ data: Extracted; engine: string } | null> {
  const f = opts.fetchFn ?? fetch;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await f(`${opts.url}/api/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal: AbortSignal.timeout(opts.timeoutMs ?? 60_000),
        body: JSON.stringify({
          model: opts.model,
          stream: false,
          format: "json",
          options: { temperature: 0 },
          messages: [{ role: "system", content: SYSTEM }, { role: "user", content: text.slice(0, 12_000) }],
        }),
      });
      if (!res.ok) return null;
      const body = (await res.json()) as { message?: { content?: string } };
      const parsed = extractedSchema.safeParse(JSON.parse(body.message?.content ?? "{}"));
      if (!parsed.success) continue; // one retry, then fall back to rules
      const data: Extracted = {};
      for (const k of ALL_FIELDS) {
        const v = parsed.data[k];
        const empty = Array.isArray(have[k]) ? (have[k] as string[]).length === 0 : !have[k];
        if (!empty || v == null) continue;
        if (Array.isArray(v)) { if (v.length) (data as Record<string, unknown>)[k] = v.map(clean).filter(Boolean); }
        else if (clean(v)) (data as Record<string, unknown>)[k] = typeof v === "string" ? clean(v) : v;
      }
      return { data, engine: opts.model };
    } catch {
      return null;
    }
  }
  return null;
}

export function mergeExtracted(base: Extracted, extra: Extracted): Extracted {
  return { ...extra, ...Object.fromEntries(Object.entries(base).filter(([, v]) => (Array.isArray(v) ? v.length : !!v))) } as Extracted;
}
