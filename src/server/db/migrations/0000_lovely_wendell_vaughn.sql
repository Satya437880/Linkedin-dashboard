CREATE TABLE "activities" (
	"id" serial PRIMARY KEY NOT NULL,
	"prospect_id" integer,
	"actor" text NOT NULL,
	"action" text NOT NULL,
	"details" jsonb,
	"dedupe_key" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "activities_dedupe_key_unique" UNIQUE("dedupe_key")
);
--> statement-breakpoint
CREATE TABLE "ai_insights" (
	"id" serial PRIMARY KEY NOT NULL,
	"prospect_id" integer NOT NULL,
	"kind" text NOT NULL,
	"output" jsonb NOT NULL,
	"engine" text NOT NULL,
	"prompt_version" text,
	"input_message_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "alerts" (
	"id" serial PRIMARY KEY NOT NULL,
	"prospect_id" integer,
	"type" text NOT NULL,
	"dedupe_key" text NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "alerts_dedupe_key_unique" UNIQUE("dedupe_key")
);
--> statement-breakpoint
CREATE TABLE "attachments" (
	"id" serial PRIMARY KEY NOT NULL,
	"prospect_id" integer NOT NULL,
	"kind" text NOT NULL,
	"file_path" text NOT NULL,
	"filename" text NOT NULL,
	"size" integer NOT NULL,
	"mime" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "companies" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"linkedin_url" text,
	"website" text,
	"industry" text,
	"employee_count" text,
	"revenue_text" text,
	"headquarters" text,
	"ai_overview" jsonb,
	"enriched_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" serial PRIMARY KEY NOT NULL,
	"prospect_id" integer NOT NULL,
	"external_thread_id" text NOT NULL,
	"inbox" text NOT NULL,
	"thread_url" text,
	"subject" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conversations_external_thread_id_unique" UNIQUE("external_thread_id")
);
--> statement-breakpoint
CREATE TABLE "invitations" (
	"id" serial PRIMARY KEY NOT NULL,
	"provider_user_id" text NOT NULL,
	"sent_at" timestamp with time zone,
	"accepted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" serial PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"run_after" timestamp with time zone DEFAULT now() NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"conversation_id" integer NOT NULL,
	"prospect_id" integer NOT NULL,
	"external_message_id" text NOT NULL,
	"direction" text NOT NULL,
	"text" text NOT NULL,
	"sent_at" timestamp with time zone NOT NULL,
	"sender_name" text,
	"duplicate_of" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "messages_external_message_id_unique" UNIQUE("external_message_id")
);
--> statement-breakpoint
CREATE TABLE "notes" (
	"id" serial PRIMARY KEY NOT NULL,
	"prospect_id" integer NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prospect_audit" (
	"id" serial PRIMARY KEY NOT NULL,
	"prospect_id" integer NOT NULL,
	"contact_info" text,
	"findings" jsonb,
	"recommendations" jsonb,
	"issues" jsonb,
	"pain_points" jsonb,
	"requirements" jsonb,
	"notes" text,
	"source" text,
	"raw_text" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "prospect_audit_prospect_id_unique" UNIQUE("prospect_id")
);
--> statement-breakpoint
CREATE TABLE "prospect_tags" (
	"prospect_id" integer NOT NULL,
	"tag_id" integer NOT NULL,
	CONSTRAINT "prospect_tags_prospect_id_tag_id_pk" PRIMARY KEY("prospect_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "prospects" (
	"id" serial PRIMARY KEY NOT NULL,
	"provider_user_id" text NOT NULL,
	"full_name" text NOT NULL,
	"photo_url" text,
	"linkedin_url" text,
	"headline" text,
	"designation" text,
	"company_id" integer,
	"location" text,
	"industry" text,
	"owner" text,
	"category" text DEFAULT 'unclassified' NOT NULL,
	"category_source" text,
	"sentiment" text,
	"lead_score" integer DEFAULT 0 NOT NULL,
	"stage" text DEFAULT 'fresh' NOT NULL,
	"do_not_contact" boolean DEFAULT false NOT NULL,
	"next_follow_up_at" timestamp with time zone,
	"last_inbound_at" timestamp with time zone,
	"last_outbound_at" timestamp with time zone,
	"last_activity_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "prospects_provider_user_id_unique" UNIQUE("provider_user_id")
);
--> statement-breakpoint
CREATE TABLE "raw_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"external_message_id" text NOT NULL,
	"event_type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stage_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"prospect_id" integer NOT NULL,
	"from_stage" text,
	"to_stage" text NOT NULL,
	"reason" text,
	"actor" text NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "tags_name_unique" UNIQUE("name")
);
--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_prospect_id_prospects_id_fk" FOREIGN KEY ("prospect_id") REFERENCES "public"."prospects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_insights" ADD CONSTRAINT "ai_insights_prospect_id_prospects_id_fk" FOREIGN KEY ("prospect_id") REFERENCES "public"."prospects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_insights" ADD CONSTRAINT "ai_insights_input_message_id_messages_id_fk" FOREIGN KEY ("input_message_id") REFERENCES "public"."messages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_prospect_id_prospects_id_fk" FOREIGN KEY ("prospect_id") REFERENCES "public"."prospects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_prospect_id_prospects_id_fk" FOREIGN KEY ("prospect_id") REFERENCES "public"."prospects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_prospect_id_prospects_id_fk" FOREIGN KEY ("prospect_id") REFERENCES "public"."prospects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_prospect_id_prospects_id_fk" FOREIGN KEY ("prospect_id") REFERENCES "public"."prospects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_prospect_id_prospects_id_fk" FOREIGN KEY ("prospect_id") REFERENCES "public"."prospects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospect_audit" ADD CONSTRAINT "prospect_audit_prospect_id_prospects_id_fk" FOREIGN KEY ("prospect_id") REFERENCES "public"."prospects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospect_tags" ADD CONSTRAINT "prospect_tags_prospect_id_prospects_id_fk" FOREIGN KEY ("prospect_id") REFERENCES "public"."prospects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospect_tags" ADD CONSTRAINT "prospect_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospects" ADD CONSTRAINT "prospects_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stage_history" ADD CONSTRAINT "stage_history_prospect_id_prospects_id_fk" FOREIGN KEY ("prospect_id") REFERENCES "public"."prospects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activities_prospect_idx" ON "activities" USING btree ("prospect_id","occurred_at");--> statement-breakpoint
CREATE INDEX "jobs_status_idx" ON "jobs" USING btree ("status","run_after");--> statement-breakpoint
CREATE INDEX "messages_conv_idx" ON "messages" USING btree ("conversation_id","sent_at");--> statement-breakpoint
CREATE INDEX "prospects_cat_idx" ON "prospects" USING btree ("category","stage");--> statement-breakpoint
CREATE INDEX "prospects_followup_idx" ON "prospects" USING btree ("next_follow_up_at");--> statement-breakpoint
CREATE INDEX "prospects_inbound_idx" ON "prospects" USING btree ("last_inbound_at");--> statement-breakpoint
CREATE UNIQUE INDEX "raw_events_uq" ON "raw_events" USING btree ("source","external_message_id");