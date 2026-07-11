CREATE TYPE "public"."voice_call_status" AS ENUM('ONGOING', 'ENDED', 'MISSED');--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'VOICE_MISSED';--> statement-breakpoint
CREATE TABLE "voice_call" (
	"id" text PRIMARY KEY NOT NULL,
	"league_id" text,
	"match_id" text,
	"dm_thread_id" text,
	"initiator_id" text,
	"status" "voice_call_status" DEFAULT 'ONGOING' NOT NULL,
	"participant_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	CONSTRAINT "voice_call_scope_xor" CHECK (num_nonnulls("voice_call"."league_id", "voice_call"."dm_thread_id") = 1)
);
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "push_calls" boolean;--> statement-breakpoint
ALTER TABLE "voice_call" ADD CONSTRAINT "voice_call_league_id_league_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."league"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_call" ADD CONSTRAINT "voice_call_match_id_match_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."match"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_call" ADD CONSTRAINT "voice_call_dm_thread_id_dm_thread_id_fk" FOREIGN KEY ("dm_thread_id") REFERENCES "public"."dm_thread"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_call" ADD CONSTRAINT "voice_call_initiator_id_user_id_fk" FOREIGN KEY ("initiator_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "voice_call_league_match_idx" ON "voice_call" USING btree ("league_id","match_id","started_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "voice_call_dm_idx" ON "voice_call" USING btree ("dm_thread_id","started_at" DESC NULLS LAST);