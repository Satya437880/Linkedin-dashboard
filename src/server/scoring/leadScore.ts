export type ScoreWeights = {
  category: Record<string, number>;
  designation: number;
  recency: { days: number; points: number }[];
  perInbound: number;
  maxInbound: number;
};

export const DEFAULT_WEIGHTS: ScoreWeights = {
  category: { hot: 40, warm: 25, not_now: 10, cold: 5, unclassified: 5, negative: 0 },
  designation: 25,
  recency: [{ days: 3, points: 20 }, { days: 7, points: 15 }, { days: 14, points: 8 }, { days: 30, points: 4 }],
  perInbound: 3,
  maxInbound: 5,
};

const SENIOR = [/\bowner\b/i, /\bpresident\b/i, /general manager/i, /\b(vp|vice president|director)\b.*operations/i, /plant (manager|head)/i, /manufacturing manager/i, /engineering manager/i, /procurement/i, /purchasing/i];

export function leadScore(
  i: { category: string; designation?: string | null; lastInboundAt?: Date | null; inboundCount: number },
  w: ScoreWeights = DEFAULT_WEIGHTS,
  now = new Date(),
): number {
  let s = w.category[i.category] ?? 0;
  if (i.designation && SENIOR.some((r) => r.test(i.designation!))) s += w.designation;
  if (i.lastInboundAt) {
    const days = (now.getTime() - i.lastInboundAt.getTime()) / 86_400_000;
    const hit = [...w.recency].sort((a, b) => a.days - b.days).find((r) => days <= r.days);
    if (hit) s += hit.points;
  }
  s += Math.min(i.inboundCount, w.maxInbound) * w.perInbound;
  return Math.max(0, Math.min(100, Math.round(s)));
}
