/**
 * Sales Navigator inbox (linkedin.com/sales/inbox). Parses JSON from sales-api messaging endpoints.
 * All Sales Navigator shape knowledge lives in this file.
 *
 * Shape assumed (verify against a real capture, see extension/README.md):
 *  - thread:  { id: "THREAD", viewerUrn?: "urn:li:fs_salesProfile:(SELF,...)",
 *               participantsResolutionResults: { "<urn>": { fullName, headline|currentPositions, profilePictureDisplayImage } },
 *               messages: [ { id, body|text, deliveredAt|sentAt: ms, author: "<urn>" } ] }
 *  - A message is outbound when its author id equals the viewer id.
 */
import type { IngestEvent, Sender } from "../shared/types";
import { isObj, str, walk } from "./types";

const idOf = (urn: unknown): string | null => {
  const s = str(urn);
  if (!s) return null;
  const m = /\(([^,)]+)/.exec(s);
  return m ? m[1] : s.split(":").pop() ?? null;
};

export function looksSalesNav(json: unknown): boolean {
  let hit = false;
  walk(json, (o) => {
    if (Array.isArray(o.messages) && isObj(o.participantsResolutionResults)) hit = true;
  });
  return hit;
}

export function parseSalesNav(json: unknown): IngestEvent[] {
  const events: IngestEvent[] = [];
  walk(json, (t) => {
    if (!Array.isArray(t.messages) || !isObj(t.participantsResolutionResults)) return;
    const threadId = str(t.id) ?? str(t.threadId);
    const viewer = idOf(t.viewerUrn);
    if (!threadId || !viewer) return;

    const people = new Map<string, Sender>();
    for (const [urn, v] of Object.entries(t.participantsResolutionResults)) {
      if (!isObj(v)) continue;
      const id = idOf(urn);
      const fullName = str(v.fullName) ?? [str(v.firstName), str(v.lastName)].filter(Boolean).join(" ");
      if (!id || !fullName) continue;
      const pos = Array.isArray(v.currentPositions) && isObj(v.currentPositions[0]) ? v.currentPositions[0] : null;
      const headline = str(v.headline) ?? (pos ? [str(pos.title), str(pos.companyName)].filter(Boolean).join(" at ") || null : null);
      const img = isObj(v.profilePictureDisplayImage) ? str(v.profilePictureDisplayImage.rootUrl) : null;
      people.set(id, { providerUserId: id, fullName, headline, photoUrl: img, linkedinUrl: `https://www.linkedin.com/sales/lead/${id}` });
    }

    for (const m of t.messages) {
      if (!isObj(m)) continue;
      const text = str(m.body) ?? str(m.text);
      const when = typeof m.deliveredAt === "number" ? m.deliveredAt : typeof m.sentAt === "number" ? m.sentAt : null;
      const author = idOf(m.author);
      const mid = str(m.id) ?? str(m.entityUrn);
      if (!text || !when || !author || !mid) continue;
      const outbound = author === viewer;
      const prospect = people.get(outbound ? [...people.keys()].find((k) => k !== viewer) ?? "" : author);
      if (!prospect) continue;
      events.push({
        source: "extension",
        eventType: "message.new",
        externalMessageId: `sn:${threadId}:${mid}`,
        externalThreadId: `sn:${threadId}`,
        inbox: "sales_navigator",
        direction: outbound ? "outbound" : "inbound",
        text,
        sentAt: new Date(when).toISOString(),
        sender: prospect,
        threadUrl: `https://www.linkedin.com/sales/inbox/${threadId}`,
      });
    }
  });
  return events;
}
