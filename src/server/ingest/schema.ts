import { z } from "zod";

export const ingestEventSchema = z.object({
  source: z.enum(["extension", "manual", "csv"]),
  eventType: z.enum(["message.new", "relation.new", "profile.view"]),
  externalMessageId: z.string().min(1).max(300),
  externalThreadId: z.string().min(1).max(300),
  inbox: z.enum(["classic", "sales_navigator", "manual"]),
  direction: z.enum(["inbound", "outbound"]),
  text: z.string().max(20000),
  sentAt: z.coerce.date(),
  sender: z.object({
    linkedinUrl: z.string().url().nullish(),
    providerUserId: z.string().min(1).max(300),
    fullName: z.string().min(1).max(300),
    headline: z.string().max(500).nullish(),
    photoUrl: z.string().url().nullish(),
  }),
  threadUrl: z.string().url().nullish(),
  raw: z.unknown().optional(),
});

export type IngestEvent = z.infer<typeof ingestEventSchema>;
