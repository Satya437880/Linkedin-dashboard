import Link from "next/link";
import { desc, eq, isNotNull, isNull, and, inArray } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { alerts, prospects } from "@/server/db/schema";
import { fmtDateTime, relTime } from "@/lib/format";
import { IconBell } from "./Icons";

export async function AlertBar() {
  const rows = await getDb()
    .select({ a: alerts, name: prospects.fullName })
    .from(alerts)
    .leftJoin(prospects, eq(alerts.prospectId, prospects.id))
    .where(and(isNull(alerts.readAt), isNotNull(prospects.lastInboundAt), inArray(alerts.type, ["new_reply", "follow_up_due"])))
    .orderBy(desc(alerts.createdAt))
    .limit(4);
  if (rows.length === 0) return null;
  return (
    <div role="status" aria-label="Alerts" className="border-b border-line bg-rose/20">
      {rows.map(({ a, name }) => (
        <Link key={a.id} href={`/prospects/${a.prospectId}`}
          className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-sm text-wine-deep hover:bg-rose/30 md:px-6 lg:px-8">
          <IconBell className="shrink-0" />
          <span className="min-w-0 flex-1">
            {a.type === "new_reply" ? <>New reply received from <strong>{name}</strong></> : <>Follow-up due today: <strong>{name}</strong></>}
          </span>
          <span className="text-slate-brand">{a.type === "new_reply" ? relTime(a.createdAt) : fmtDateTime(a.createdAt)}</span>
        </Link>
      ))}
    </div>
  );
}
