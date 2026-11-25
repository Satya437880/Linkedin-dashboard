import { sql } from "drizzle-orm";
import { pgTable, text, integer, serial, boolean, timestamp, jsonb, uniqueIndex, index, primaryKey } from "drizzle-orm/pg-core";

const ts = (name: string) => timestamp(name, { mode: "date", withTimezone: true });
const nowMs = sql`now()`;
const createdAt = () => ts("created_at").notNull().default(nowMs);
const id = () => serial("id").primaryKey();

export const CATEGORIES = ["hot", "warm", "cold", "not_now", "negative", "unclassified"] as const;
export const STAGES = ["fresh", "follow_up_1", "follow_up_2", "follow_up_3", "meeting_scheduled", "opportunity", "won", "lost"] as const;

export const companies = pgTable("companies", {
  id: id(),
  name: text("name").notNull(),
  linkedinUrl: text("linkedin_url"),
  website: text("website"),
  industry: text("industry"),
  employeeCount: text("employee_count"),
  revenueText: text("revenue_text"),
  headquarters: text("headquarters"),
  aiOverview: jsonb("ai_overview"),
  enrichedAt: ts("enriched_at"),
  createdAt: createdAt(),
});

export const prospects = pgTable(
  "prospects",
  {
    id: id(),
    providerUserId: text("provider_user_id").notNull().unique(),
    fullName: text("full_name").notNull(),
    photoUrl: text("photo_url"),
    linkedinUrl: text("linkedin_url"),
    headline: text("headline"),
    designation: text("designation"),
    companyId: integer("company_id").references(() => companies.id),
    location: text("location"),
    industry: text("industry"),
    owner: text("owner"),
    category: text("category", { enum: CATEGORIES }).notNull().default("unclassified"),
    categorySource: text("category_source", { enum: ["ai", "rules", "manual"] }),
    sentiment: text("sentiment", { enum: ["positive", "neutral", "negative"] }),
    leadScore: integer("lead_score").notNull().default(0),
    stage: text("stage", { enum: STAGES }).notNull().default("fresh"),
    doNotContact: boolean("do_not_contact").notNull().default(false),
    nextFollowUpAt: ts("next_follow_up_at"),
    lastInboundAt: ts("last_inbound_at"),
    lastOutboundAt: ts("last_outbound_at"),
    lastActivityAt: ts("last_activity_at"),
    archivedAt: ts("archived_at"),
    createdAt: createdAt(),
  },
  (t) => [
    index("prospects_cat_idx").on(t.category, t.stage),
    index("prospects_followup_idx").on(t.nextFollowUpAt),
    index("prospects_inbound_idx").on(t.lastInboundAt),
  ],
);

export const conversations = pgTable("conversations", {
  id: id(),
  prospectId: integer("prospect_id").notNull().references(() => prospects.id),
  externalThreadId: text("external_thread_id").notNull().unique(),
  inbox: text("inbox", { enum: ["classic", "sales_navigator", "manual"] }).notNull(),
  threadUrl: text("thread_url"),
  subject: text("subject"),
  createdAt: createdAt(),
});

export const messages = pgTable(
  "messages",
  {
    id: id(),
    conversationId: integer("conversation_id").notNull().references(() => conversations.id),
    prospectId: integer("prospect_id").notNull().references(() => prospects.id),
    externalMessageId: text("external_message_id").notNull().unique(),
    direction: text("direction", { enum: ["inbound", "outbound"] }).notNull(),
    text: text("text").notNull(),
    sentAt: ts("sent_at").notNull(),
    senderName: text("sender_name"),
    /** Set when this message repeats another one (e.g. a sheet row that the real conversation also contains). Hidden in views, never deleted. */
    duplicateOf: integer("duplicate_of"),
    createdAt: createdAt(),
  },
  (t) => [index("messages_conv_idx").on(t.conversationId, t.sentAt)],
);

export const aiInsights = pgTable("ai_insights", {
  id: id(),
  prospectId: integer("prospect_id").notNull().references(() => prospects.id),
  kind: text("kind", { enum: ["intent", "summary", "next_action", "suggested_reply", "follow_up_draft", "company_overview"] }).notNull(),
  output: jsonb("output").notNull(),
  engine: text("engine").notNull(),
  promptVersion: text("prompt_version"),
  inputMessageId: integer("input_message_id").references(() => messages.id),
  createdAt: createdAt(),
});

export const activities = pgTable(
  "activities",
  {
    id: id(),
    prospectId: integer("prospect_id").references(() => prospects.id),
    actor: text("actor", { enum: ["system", "user"] }).notNull(),
    action: text("action").notNull(),
    details: jsonb("details"),
    dedupeKey: text("dedupe_key").unique(),
    occurredAt: ts("occurred_at").notNull().default(nowMs),
  },
  (t) => [index("activities_prospect_idx").on(t.prospectId, t.occurredAt)],
);

export const stageHistory = pgTable("stage_history", {
  id: id(),
  prospectId: integer("prospect_id").notNull().references(() => prospects.id),
  fromStage: text("from_stage"),
  toStage: text("to_stage").notNull(),
  reason: text("reason"),
  actor: text("actor", { enum: ["system", "user"] }).notNull(),
  occurredAt: ts("occurred_at").notNull().default(nowMs),
});

export const notes = pgTable("notes", {
  id: id(),
  prospectId: integer("prospect_id").notNull().references(() => prospects.id),
  body: text("body").notNull(),
  createdAt: createdAt(),
});

export const tags = pgTable("tags", { id: id(), name: text("name").notNull().unique() });

export const prospectTags = pgTable(
  "prospect_tags",
  {
    prospectId: integer("prospect_id").notNull().references(() => prospects.id),
    tagId: integer("tag_id").notNull().references(() => tags.id),
  },
  (t) => [primaryKey({ columns: [t.prospectId, t.tagId] })],
);

export const attachments = pgTable("attachments", {
  id: id(),
  prospectId: integer("prospect_id").notNull().references(() => prospects.id),
  kind: text("kind", { enum: ["brochure", "capability_deck", "quotation", "drawing", "meeting_notes", "other"] }).notNull(),
  filePath: text("file_path").notNull(),
  filename: text("filename").notNull(),
  size: integer("size").notNull(),
  mime: text("mime").notNull(),
  createdAt: createdAt(),
});

export const alerts = pgTable("alerts", {
  id: id(),
  prospectId: integer("prospect_id").references(() => prospects.id),
  type: text("type", { enum: ["new_reply", "follow_up_due", "meeting_scheduled", "profile_view", "hot_lead", "no_response_14d", "capture_stale"] }).notNull(),
  dedupeKey: text("dedupe_key").notNull().unique(),
  readAt: ts("read_at"),
  createdAt: createdAt(),
});

export const invitations = pgTable("invitations", {
  id: id(),
  providerUserId: text("provider_user_id").notNull(),
  sentAt: ts("sent_at"),
  acceptedAt: ts("accepted_at"),
});

export const rawEvents = pgTable(
  "raw_events",
  {
    id: id(),
    source: text("source").notNull(),
    externalMessageId: text("external_message_id").notNull(),
    eventType: text("event_type").notNull(),
    payload: jsonb("payload").notNull(),
    receivedAt: createdAt(),
  },
  (t) => [uniqueIndex("raw_events_uq").on(t.source, t.externalMessageId)],
);

export const jobs = pgTable(
  "jobs",
  {
    id: id(),
    type: text("type").notNull(),
    payload: jsonb("payload").notNull(),
    status: text("status", { enum: ["pending", "running", "done", "failed"] }).notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    runAfter: ts("run_after").notNull().default(nowMs),
    lastError: text("last_error"),
    createdAt: createdAt(),
  },
  (t) => [index("jobs_status_idx").on(t.status, t.runAfter)],
);

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
});

/** Audit and research details per prospect, filled from a connected sheet or pasted text. One row per prospect. */
export const prospectAudit = pgTable("prospect_audit", {
  id: id(),
  prospectId: integer("prospect_id").notNull().unique().references(() => prospects.id),
  contactInfo: text("contact_info"),
  findings: jsonb("findings").$type<string[]>(),
  recommendations: jsonb("recommendations").$type<string[]>(),
  issues: jsonb("issues").$type<string[]>(),
  painPoints: jsonb("pain_points").$type<string[]>(),
  requirements: jsonb("requirements").$type<string[]>(),
  notes: text("notes"),
  source: text("source", { enum: ["sheet", "paste", "manual"] }),
  rawText: text("raw_text"),
  updatedAt: ts("updated_at").notNull().default(nowMs),
});
