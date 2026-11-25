import { sql } from "drizzle-orm";
import { sqliteTable, text, integer, uniqueIndex, index, primaryKey } from "drizzle-orm/sqlite-core";

const ts = (name: string) => integer(name, { mode: "timestamp_ms" });
const nowMs = sql`(cast(unixepoch('subsec') * 1000 as integer))`;
const createdAt = () => ts("created_at").notNull().default(nowMs);
const id = () => integer("id").primaryKey({ autoIncrement: true });

export const CATEGORIES = ["hot", "warm", "cold", "not_now", "negative", "unclassified"] as const;
export const STAGES = ["fresh", "follow_up_1", "follow_up_2", "follow_up_3", "meeting_scheduled", "opportunity", "won", "lost"] as const;

export const companies = sqliteTable("companies", {
  id: id(),
  name: text("name").notNull(),
  linkedinUrl: text("linkedin_url"),
  website: text("website"),
  industry: text("industry"),
  employeeCount: text("employee_count"),
  revenueText: text("revenue_text"),
  headquarters: text("headquarters"),
  aiOverview: text("ai_overview", { mode: "json" }),
  enrichedAt: ts("enriched_at"),
  createdAt: createdAt(),
});

export const prospects = sqliteTable(
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
    doNotContact: integer("do_not_contact", { mode: "boolean" }).notNull().default(false),
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

export const conversations = sqliteTable("conversations", {
  id: id(),
  prospectId: integer("prospect_id").notNull().references(() => prospects.id),
  externalThreadId: text("external_thread_id").notNull().unique(),
  inbox: text("inbox", { enum: ["classic", "sales_navigator", "manual"] }).notNull(),
  threadUrl: text("thread_url"),
  subject: text("subject"),
  createdAt: createdAt(),
});

export const messages = sqliteTable(
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

export const aiInsights = sqliteTable("ai_insights", {
  id: id(),
  prospectId: integer("prospect_id").notNull().references(() => prospects.id),
  kind: text("kind", { enum: ["intent", "summary", "next_action", "suggested_reply", "follow_up_draft", "company_overview"] }).notNull(),
  output: text("output", { mode: "json" }).notNull(),
  engine: text("engine").notNull(),
  promptVersion: text("prompt_version"),
  inputMessageId: integer("input_message_id").references(() => messages.id),
  createdAt: createdAt(),
});

export const activities = sqliteTable(
  "activities",
  {
    id: id(),
    prospectId: integer("prospect_id").references(() => prospects.id),
    actor: text("actor", { enum: ["system", "user"] }).notNull(),
    action: text("action").notNull(),
    details: text("details", { mode: "json" }),
    dedupeKey: text("dedupe_key").unique(),
    occurredAt: ts("occurred_at").notNull().default(nowMs),
  },
  (t) => [index("activities_prospect_idx").on(t.prospectId, t.occurredAt)],
);

export const stageHistory = sqliteTable("stage_history", {
  id: id(),
  prospectId: integer("prospect_id").notNull().references(() => prospects.id),
  fromStage: text("from_stage"),
  toStage: text("to_stage").notNull(),
  reason: text("reason"),
  actor: text("actor", { enum: ["system", "user"] }).notNull(),
  occurredAt: ts("occurred_at").notNull().default(nowMs),
});

export const notes = sqliteTable("notes", {
  id: id(),
  prospectId: integer("prospect_id").notNull().references(() => prospects.id),
  body: text("body").notNull(),
  createdAt: createdAt(),
});

export const tags = sqliteTable("tags", { id: id(), name: text("name").notNull().unique() });

export const prospectTags = sqliteTable(
  "prospect_tags",
  {
    prospectId: integer("prospect_id").notNull().references(() => prospects.id),
    tagId: integer("tag_id").notNull().references(() => tags.id),
  },
  (t) => [primaryKey({ columns: [t.prospectId, t.tagId] })],
);

export const attachments = sqliteTable("attachments", {
  id: id(),
  prospectId: integer("prospect_id").notNull().references(() => prospects.id),
  kind: text("kind", { enum: ["brochure", "capability_deck", "quotation", "drawing", "meeting_notes", "other"] }).notNull(),
  filePath: text("file_path").notNull(),
  filename: text("filename").notNull(),
  size: integer("size").notNull(),
  mime: text("mime").notNull(),
  createdAt: createdAt(),
});

export const alerts = sqliteTable("alerts", {
  id: id(),
  prospectId: integer("prospect_id").references(() => prospects.id),
  type: text("type", { enum: ["new_reply", "follow_up_due", "meeting_scheduled", "profile_view", "hot_lead", "no_response_14d", "capture_stale"] }).notNull(),
  dedupeKey: text("dedupe_key").notNull().unique(),
  readAt: ts("read_at"),
  createdAt: createdAt(),
});

export const invitations = sqliteTable("invitations", {
  id: id(),
  providerUserId: text("provider_user_id").notNull(),
  sentAt: ts("sent_at"),
  acceptedAt: ts("accepted_at"),
});

export const rawEvents = sqliteTable(
  "raw_events",
  {
    id: id(),
    source: text("source").notNull(),
    externalMessageId: text("external_message_id").notNull(),
    eventType: text("event_type").notNull(),
    payload: text("payload", { mode: "json" }).notNull(),
    receivedAt: createdAt(),
  },
  (t) => [uniqueIndex("raw_events_uq").on(t.source, t.externalMessageId)],
);

export const jobs = sqliteTable(
  "jobs",
  {
    id: id(),
    type: text("type").notNull(),
    payload: text("payload", { mode: "json" }).notNull(),
    status: text("status", { enum: ["pending", "running", "done", "failed"] }).notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    runAfter: ts("run_after").notNull().default(nowMs),
    lastError: text("last_error"),
    createdAt: createdAt(),
  },
  (t) => [index("jobs_status_idx").on(t.status, t.runAfter)],
);

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value", { mode: "json" }).notNull(),
});

/** Audit and research details per prospect, filled from a connected sheet or pasted text. One row per prospect. */
export const prospectAudit = sqliteTable("prospect_audit", {
  id: id(),
  prospectId: integer("prospect_id").notNull().unique().references(() => prospects.id),
  contactInfo: text("contact_info"),
  findings: text("findings", { mode: "json" }).$type<string[]>(),
  recommendations: text("recommendations", { mode: "json" }).$type<string[]>(),
  issues: text("issues", { mode: "json" }).$type<string[]>(),
  painPoints: text("pain_points", { mode: "json" }).$type<string[]>(),
  requirements: text("requirements", { mode: "json" }).$type<string[]>(),
  notes: text("notes"),
  source: text("source", { enum: ["sheet", "paste", "manual"] }),
  rawText: text("raw_text"),
  updatedAt: ts("updated_at").notNull().default(nowMs),
});
