CREATE OR REPLACE FUNCTION forbid_change() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION '%', TG_ARGV[0]; END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER activities_no_update BEFORE UPDATE ON activities FOR EACH ROW EXECUTE FUNCTION forbid_change('activities is append-only');
--> statement-breakpoint
CREATE TRIGGER activities_no_delete BEFORE DELETE ON activities FOR EACH ROW EXECUTE FUNCTION forbid_change('activities is append-only');
--> statement-breakpoint
CREATE TRIGGER stage_history_no_update BEFORE UPDATE ON stage_history FOR EACH ROW EXECUTE FUNCTION forbid_change('stage_history is append-only');
--> statement-breakpoint
CREATE TRIGGER stage_history_no_delete BEFORE DELETE ON stage_history FOR EACH ROW EXECUTE FUNCTION forbid_change('stage_history is append-only');
--> statement-breakpoint
CREATE TRIGGER messages_no_delete BEFORE DELETE ON messages FOR EACH ROW EXECUTE FUNCTION forbid_change('messages are never deleted');
--> statement-breakpoint
CREATE TRIGGER prospects_no_delete BEFORE DELETE ON prospects FOR EACH ROW EXECUTE FUNCTION forbid_change('prospects are archived, never deleted');
--> statement-breakpoint
INSERT INTO tags (name) VALUES ('Aerospace'), ('Automotive'), ('Medical'), ('Procurement'), ('OEM'), ('CNC Machining'), ('Packaging'), ('Agriculture') ON CONFLICT (name) DO NOTHING;
--> statement-breakpoint
-- Supabase exposes tables through its REST API; with RLS on and no policies, only the server's own database connection can read or write.
ALTER TABLE "activities" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "ai_insights" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "alerts" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "attachments" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "companies" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "conversations" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "invitations" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "jobs" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "messages" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "notes" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "prospect_audit" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "prospect_tags" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "prospects" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "raw_events" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "settings" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "stage_history" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "tags" ENABLE ROW LEVEL SECURITY;
