const CAT: Record<string, { label: string; cls: string }> = {
  hot: { label: "Hot lead", cls: "bg-wine text-white" },
  warm: { label: "Positive", cls: "bg-rose text-[#4a1722]" },
  cold: { label: "Cold", cls: "bg-[#e8ebec] text-[#3f4547]" },
  not_now: { label: "Not at this time", cls: "bg-slate-brand text-white" },
  negative: { label: "Negative", cls: "bg-ink text-white" },
  follow_up: { label: "Follow up", cls: "border border-wine bg-white text-wine" },
  unclassified: { label: "New", cls: "bg-rose/25 text-[#4f5658]" },
};
const SENT: Record<string, { label: string; cls: string }> = {
  positive: { label: "Positive", cls: "bg-success-bg text-success" },
  neutral: { label: "Neutral", cls: "bg-[#e8ebec] text-[#3f4547]" },
  negative: { label: "Negative", cls: "bg-danger-bg text-danger" },
};
const FLOW: Record<string, { label: string; cls: string }> = {
  follow_up: { label: "Follow up", cls: "border border-wine bg-white text-wine" },
  replied: { label: "Replied", cls: "bg-success-bg text-success" },
  awaiting: { label: "Awaiting reply", cls: "bg-[#e8ebec] text-[#3f4547]" },
  new: { label: "New", cls: "bg-rose/25 text-[#4f5658]" },
};

const base = "inline-flex items-center whitespace-nowrap rounded-full px-3 py-1 text-sm font-medium leading-none";

export function StatusPill({ status }: { status: string }) {
  const c = CAT[status] ?? CAT.unclassified;
  return <span className={`${base} ${c.cls}`}>{c.label}</span>;
}
export function SentimentPill({ sentiment }: { sentiment: string | null }) {
  const c = SENT[sentiment ?? "neutral"] ?? SENT.neutral;
  return <span className={`${base} ${c.cls}`}>{c.label}</span>;
}
export function FlowPill({ flow }: { flow: string }) {
  const c = FLOW[flow] ?? FLOW.new;
  return <span className={`${base} ${c.cls}`}>{c.label}</span>;
}

type P = { category: string; nextFollowUpAt: Date | null; lastInboundAt: Date | null; lastOutboundAt: Date | null };

/** Status used for filters: "Follow up" wins when a follow-up is due and the prospect has not replied since. */
export function statusOf(p: P, now = Date.now()) {
  const noReplySince = !p.lastInboundAt || (p.lastOutboundAt && p.lastOutboundAt > p.lastInboundAt);
  if (p.nextFollowUpAt && p.nextFollowUpAt.getTime() <= now && noReplySince) return "follow_up";
  return p.category;
}

/** Where the conversation stands: Follow up, Replied, Awaiting reply, or New. */
export function workflowStatus(p: P, now = Date.now()): "follow_up" | "replied" | "awaiting" | "new" {
  const noReplySince = !p.lastInboundAt || (p.lastOutboundAt && p.lastOutboundAt > p.lastInboundAt);
  if (p.nextFollowUpAt && p.nextFollowUpAt.getTime() <= now && noReplySince) return "follow_up";
  if (p.lastInboundAt && !(p.lastOutboundAt && p.lastOutboundAt > p.lastInboundAt)) return "replied";
  if (p.lastOutboundAt) return "awaiting";
  return "new";
}
