const PILLS = [
  { label: "Fresh", stages: ["fresh"] },
  { label: "Follow-up 1", stages: ["follow_up_1"] },
  { label: "Follow-up 2", stages: ["follow_up_2"] },
  { label: "Follow-up 3", stages: ["follow_up_3"] },
  { label: "Meeting", stages: ["meeting_scheduled"] },
  { label: "Opportunity", stages: ["opportunity"] },
  { label: "Won / lost", stages: ["won", "lost"] },
];

export function StageBar({ stage }: { stage: string }) {
  return (
    <ol aria-label="Stage" className="flex flex-wrap gap-2">
      {PILLS.map((p) => {
        const on = p.stages.includes(stage);
        return (
          <li key={p.label} aria-current={on ? "step" : undefined}
            className={`rounded-full border px-3 py-1.5 text-sm ${on ? "border-wine bg-wine font-semibold text-white" : "border-line bg-white text-slate-brand"}`}>
            {p.label}
          </li>
        );
      })}
    </ol>
  );
}
