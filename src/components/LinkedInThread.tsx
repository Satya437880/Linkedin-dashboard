/* eslint-disable @next/next/no-img-element */
import { TZ } from "@/lib/format";

type Msg = { id: number; direction: "inbound" | "outbound"; text: string; sentAt: Date };
type Props = {
  messages: Msg[];
  prospectName: string;
  prospectPhoto: string | null;
  prospectHeadline: string | null;
  ownerName: string;
};

const SAME_SENDER_GAP_MS = 5 * 60 * 1000;

const dayKey = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ(), year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

/** LinkedIn style day label: TODAY, YESTERDAY, a weekday inside the last week, otherwise the date. */
const dayLabel = (d: Date) => {
  const k = dayKey(d);
  if (k === dayKey(new Date())) return "TODAY";
  if (k === dayKey(new Date(Date.now() - 86_400_000))) return "YESTERDAY";
  const ageDays = (Date.now() - d.getTime()) / 86_400_000;
  const fmt = ageDays < 7
    ? new Intl.DateTimeFormat("en-CA", { timeZone: TZ(), weekday: "long" })
    : new Intl.DateTimeFormat("en-CA", { timeZone: TZ(), month: "short", day: "numeric", year: "numeric" });
  return fmt.format(d).toUpperCase();
};

const timeLabel = (d: Date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: TZ(), hour: "numeric", minute: "2-digit", hour12: true })
    .format(d)
    .replace(/ | /g, " ")
    .replace(/\./g, "")
    .replace(/\b(am|pm)\b/i, (m) => m.toUpperCase());

const URL_RE = /(https?:\/\/[^\s<]+[^\s<.,;:!?)"'\]])/g;

/** Keeps the message exactly as sent (line breaks, blank lines, spacing) and makes links clickable. */
function MessageText({ text }: { text: string }) {
  return (
    <>
      {text.split(URL_RE).map((part, i) =>
        i % 2 === 1 ? (
          <a key={i} href={part} target="_blank" rel="noreferrer noopener" className="text-wine underline underline-offset-2">{part}</a>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

function Avatar({ mine, name, photo }: { mine: boolean; name: string; photo: string | null }) {
  const cls = "h-10 w-10 shrink-0 rounded-full";
  if (mine) return <img src="/logo.png" alt="" className={`${cls} border border-line bg-white`} />;
  if (photo) return <img src={photo} alt="" className={cls} />;
  return <span aria-hidden="true" className={`${cls} flex items-center justify-center bg-rose text-sm font-semibold text-wine-deep`}>{name.slice(0, 1)}</span>;
}

/**
 * Same structure as LinkedIn messaging: a name and headline header, centred day labels, and per message an
 * avatar, bold name, time and plain text. Our messages sit on the left and the client's replies on the right.
 */
export function LinkedInThread({ messages, prospectName, prospectPhoto, prospectHeadline, ownerName }: Props) {
  const items: React.ReactNode[] = [];
  let lastDay = "";
  let i = 0;
  while (i < messages.length) {
    const first = messages[i];
    const k = dayKey(first.sentAt);
    if (k !== lastDay) {
      lastDay = k;
      items.push(
        <div key={`d-${k}-${first.id}`} className="my-5 flex items-center gap-3 text-[0.6875rem] font-semibold tracking-wider text-slate-brand">
          <span className="h-px flex-1 bg-rose/50" />{dayLabel(first.sentAt)}<span className="h-px flex-1 bg-rose/50" />
        </div>,
      );
    }
    // consecutive lines from the same sender a few minutes apart share one avatar and name, like LinkedIn
    const group: Msg[] = [first];
    while (
      i + group.length < messages.length &&
      messages[i + group.length].direction === first.direction &&
      dayKey(messages[i + group.length].sentAt) === k &&
      messages[i + group.length].sentAt.getTime() - group[group.length - 1].sentAt.getTime() <= SAME_SENDER_GAP_MS
    ) group.push(messages[i + group.length]);
    i += group.length;

    const mine = first.direction === "outbound";
    items.push(
      <div key={`g-${first.id}`} className={`flex ${mine ? "justify-start" : "justify-end"}`}>
        <div className={`flex max-w-[85%] gap-2.5 md:max-w-[70%] ${mine ? "" : "flex-row-reverse"}`}>
          <Avatar mine={mine} name={prospectName} photo={prospectPhoto} />
          <div className={`flex min-w-0 flex-col ${mine ? "items-start" : "items-end"}`}>
            <p className="text-base leading-6">
              <span className="font-semibold text-ink">{mine ? "Maple MPSS" : prospectName}</span>
              <span className="ml-2 text-sm text-slate-brand">{timeLabel(first.sentAt)}</span>
            </p>
            <div className={`mt-1 space-y-2 rounded-2xl px-4 py-3 text-left text-base leading-relaxed text-ink ${mine ? "bg-cream" : "bg-rose/25"}`}>
              {group.map((m) => (
                <p key={m.id} className="whitespace-pre-wrap break-words"><MessageText text={m.text} /></p>
              ))}
            </div>
          </div>
        </div>
      </div>,
    );
  }
  if (items.length === 0) return <p className="text-slate-brand">No messages yet.</p>;

  return (
    <div className="w-full">
      <header className="mb-2 border-b border-line pb-4">
        <p className="font-semibold text-ink">{prospectName}</p>
        {prospectHeadline && <p className="text-sm text-slate-brand">{prospectHeadline}</p>}
      </header>
      <div className="space-y-6">{items}</div>
    </div>
  );
}
