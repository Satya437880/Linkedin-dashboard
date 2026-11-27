/**
 * Classic LinkedIn messaging (linkedin.com/messaging). Parses the JSON LinkedIn's own page has already
 * loaded (voyager messenger responses). All LinkedIn-specific shape knowledge lives in this file.
 *
 * Shape assumed (verify against a real capture, see extension/README.md):
 *  - message:       { entityUrn: "urn:li:msg_message:(urn:li:fsd_profile:SELF,2-MSGID)", body: { text }, deliveredAt: ms,
 *                     sender: { hostIdentityUrn, participantType: { member: { firstName: {text}, lastName: {text}, headline: {text}, ... } } },
 *                     conversation | "*conversation": { entityUrn: "urn:li:msg_conversation:(urn:li:fsd_profile:SELF,2-THREAD)" } }
 *  - conversation:  { entityUrn: "urn:li:msg_conversation:(...)", conversationParticipants: [ participant... ], messages: { elements: [ message... ] } }
 *  - SELF is the mailbox owner, so a message whose sender id equals SELF is outbound.
 */
import type { IngestEvent, Sender } from "../shared/types";
import { isObj, str, txt, walk } from "./types";

const PROFILE_RE = /urn:li:fsd_profile:([^,)\s]+)/;
const profileId = (urn: unknown): string | null => {
  const s = str(urn);
  const m = s ? PROFILE_RE.exec(s) : null;
  return m ? m[1] : null;
};
const threadIdOf = (convUrn: string): string => /,(2-[^)]+)\)/.exec(convUrn)?.[1] ?? convUrn;

export function participantFrom(o: Record<string, unknown>): (Sender & { id: string }) | null {
  const id = profileId(o.hostIdentityUrn);
  const pt = o.participantType;
  if (!id || !isObj(pt) || !isObj(pt.member)) return null;
  const m = pt.member;
  const fullName = [txt(m.firstName), txt(m.lastName)].filter(Boolean).join(" ").trim();
  if (!fullName) return null;
  let photoUrl: string | null = null;
  const pic = m.profilePicture;
  if (isObj(pic)) {
    const root = str(pic.rootUrl);
    const arts = Array.isArray(pic.artifacts) ? pic.artifacts : [];
    const last = arts[arts.length - 1];
    const seg = isObj(last) ? str(last.fileIdentifyingUrlPathSegment) : null;
    photoUrl = root && seg ? root + seg : null;
  }
  return {
    id,
    providerUserId: id,
    fullName,
    headline: txt(m.headline),
    photoUrl,
    linkedinUrl: str(m.profileUrl) ?? `https://www.linkedin.com/in/${id}`,
  };
}

export function looksClassic(json: unknown): boolean {
  let hit = false;
  walk(json, (o) => {
    if (typeof o.entityUrn === "string" && o.entityUrn.includes("msg_message")) hit = true;
  });
  return hit;
}

export function parseClassic(json: unknown): IngestEvent[] {
  const people = new Map<string, Sender & { id: string }>();
  walk(json, (o) => {
    const p = participantFrom(o);
    if (!p) return;
    // The same person appears several times, sometimes with fewer fields. Keep the richest value of each.
    const prev = people.get(p.id);
    people.set(p.id, prev ? { ...p, headline: p.headline ?? prev.headline, photoUrl: p.photoUrl ?? prev.photoUrl } : p);
  });

  const events: IngestEvent[] = [];

  const visit = (node: unknown, conv: { urn: string; members: string[] } | null) => {
    if (Array.isArray(node)) return node.forEach((n) => visit(n, conv));
    if (!isObj(node)) return;

    let ctx = conv;
    if (typeof node.entityUrn === "string" && node.entityUrn.includes("msg_conversation")) {
      const list = [node.conversationParticipants, node.participants].find(Array.isArray) as unknown[] | undefined;
      const members = (list ?? []).map((p) => (isObj(p) ? profileId(p.hostIdentityUrn) : null)).filter((x): x is string => !!x);
      ctx = { urn: node.entityUrn, members };
    }

    const urn = str(node.entityUrn);
    const body = isObj(node.body) ? str(node.body.text) : null;
    if (urn && urn.includes("msg_message") && body && typeof node.deliveredAt === "number") {
      const convRef = node.conversation ?? node["*conversation"] ?? node.conversationUrn;
      const convUrn = ctx?.urn ?? (isObj(convRef) ? str(convRef.entityUrn) : str(convRef));
      const selfId = profileId(urn);
      const senderObj = isObj(node.sender) ? node.sender : null;
      const senderId = senderObj ? profileId(senderObj.hostIdentityUrn) : profileId(node["*sender"]);
      if (convUrn && selfId && senderId) {
        const outbound = senderId === selfId;
        const counterId = outbound ? (ctx?.members.find((m) => m !== selfId) ?? [...people.keys()].find((k) => k !== selfId)) : senderId;
        const prospect = counterId ? people.get(counterId) : undefined;
        if (prospect) {
          const threadId = threadIdOf(convUrn);
          events.push({
            source: "extension",
            eventType: "message.new",
            externalMessageId: urn,
            externalThreadId: threadId,
            inbox: "classic",
            direction: outbound ? "outbound" : "inbound",
            text: body,
            sentAt: new Date(node.deliveredAt).toISOString(),
            sender: { providerUserId: prospect.providerUserId, fullName: prospect.fullName, headline: prospect.headline, photoUrl: prospect.photoUrl, linkedinUrl: prospect.linkedinUrl },
            threadUrl: `https://www.linkedin.com/messaging/thread/${threadId}/`,
          });
        }
      }
    }
    for (const k of Object.keys(node)) visit(node[k], ctx);
  };
  visit(json, null);

  // The same message can appear twice in one payload (list and detail); keep one.
  return [...new Map(events.map((e) => [e.externalMessageId, e])).values()];
}
