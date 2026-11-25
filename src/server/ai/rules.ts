import { z } from "zod";

export const intentSchema = z.object({
  category: z.enum(["hot", "warm", "cold", "not_now", "negative"]),
  confidence: z.number().min(0).max(1),
  sentiment: z.enum(["positive", "neutral", "negative"]),
  reason: z.string(),
  evidence_quote: z.string(),
  follow_up_date: z.string().nullable(),
  stop_contact: z.boolean(),
});
export type Intent = z.infer<typeof intentSchema>;

type Rule = { category: Intent["category"]; patterns: RegExp[]; stop?: boolean };

// Order matters: first matching group wins.
const RULES: Rule[] = [
  { category: "negative", stop: true, patterns: [/remove me/i, /stop messaging/i, /stop contacting/i, /unsubscribe/i, /do not contact/i, /don'?t contact/i] },
  { category: "negative", patterns: [/already have a supplier/i, /not interested/i, /no longer interested/i] },
  { category: "not_now", patterns: [/\bno,? thank(?:s| you)\b/i, /\bnot at this time\b/i, /\b(?:we'?re|we are|i am|i'm) (?:ok|okay|fine|good|all set|set) for now\b/i, /next quarter/i, /in (\d+|three|two|six) months?/i, /future requirement/i, /later this year/i, /not right now/i, /next year/i] },
  { category: "cold", patterns: [/not currently interested/i, /no active projects?/i, /nothing at the moment/i] },
  { category: "hot", patterns: [/quotation/i, /\bquote\b/i, /pricing/i, /\bprice\b/i, /\bsamples?\b/i, /looking for a supplier/i, /project discussion/i] },
  { category: "warm", patterns: [/send (me )?(some )?information/i, /brochure/i, /capabilit/i, /more details?/i] },
];

const REASONS: Record<Intent["category"], string> = {
  hot: "Prospect is asking about pricing, samples or an active project.",
  warm: "Prospect wants more information about our capabilities.",
  cold: "Prospect says they have no current need.",
  not_now: "Prospect is interested later, not right now.",
  negative: "Prospect is declining or asking us to stop.",
};

function sentenceWith(text: string, m: RegExpMatchArray): string {
  const idx = m.index ?? 0;
  const start = Math.max(text.lastIndexOf(".", idx), text.lastIndexOf("?", idx), text.lastIndexOf("!", idx), text.lastIndexOf("\n", idx)) + 1;
  const ends = [".", "?", "!", "\n"].map((c) => text.indexOf(c, idx)).filter((i) => i >= 0);
  const end = ends.length ? Math.min(...ends) + 1 : text.length;
  return text.slice(start, end).trim();
}

export function firstBusinessDayOfNextQuarter(now: Date): Date {
  const q = Math.floor(now.getUTCMonth() / 3);
  const d = new Date(Date.UTC(now.getUTCFullYear() + (q === 3 ? 1 : 0), ((q + 1) % 4) * 3, 1, 12));
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() + 1);
  return d;
}

function notNowDate(text: string, now: Date): Date {
  if (/next quarter/i.test(text)) return firstBusinessDayOfNextQuarter(now);
  const m = text.match(/in (\d+|two|three|six) months?/i);
  if (m) {
    const n = ({ two: 2, three: 3, six: 6 } as Record<string, number>)[m[1].toLowerCase()] ?? Number(m[1]);
    const d = new Date(now);
    d.setUTCMonth(d.getUTCMonth() + n);
    return d;
  }
  return new Date(now.getTime() + 90 * 86_400_000);
}

/** Keyword rules. Returns null when nothing matches (category stays unclassified). */
export function classifyByRules(text: string, now = new Date()): Intent | null {
  for (const rule of RULES) {
    for (const p of rule.patterns) {
      const m = text.match(p);
      if (!m) continue;
      return {
        category: rule.category,
        confidence: 0.6,
        sentiment: rule.category === "hot" || rule.category === "warm" ? "positive" : rule.category === "negative" ? "negative" : "neutral",
        reason: REASONS[rule.category],
        evidence_quote: sentenceWith(text, m),
        follow_up_date: rule.category === "not_now" ? notNowDate(text, now).toISOString() : null,
        stop_contact: !!rule.stop,
      };
    }
  }
  return null;
}

export const NEXT_ACTIONS = ["send_capability_deck", "schedule_meeting", "share_quotation", "follow_up_in_days", "answer_question", "no_action"] as const;
export type NextAction = { action: (typeof NEXT_ACTIONS)[number]; reason: string; days?: number };

export function nextActionByRules(intent: Intent | null, text: string): NextAction {
  if (!intent) return { action: text.includes("?") ? "answer_question" : "no_action", reason: "No clear buying signal; review the message." };
  switch (intent.category) {
    case "warm": return { action: "send_capability_deck", reason: "They asked for more detail on what we can do." };
    case "hot": return /quot|pric/i.test(text)
      ? { action: "share_quotation", reason: "They asked about pricing or a quotation." }
      : { action: "schedule_meeting", reason: "They are discussing a project or samples." };
    case "not_now": return { action: "follow_up_in_days", days: 90, reason: "They want to revisit later." };
    case "cold": return { action: "follow_up_in_days", days: 90, reason: "No current need; check back later." };
    default: return { action: "no_action", reason: "They declined or asked us to stop." };
  }
}
