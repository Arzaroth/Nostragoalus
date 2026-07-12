CREATE TYPE "public"."notification_type" AS ENUM('LEAGUE_JOIN', 'LEAGUE_ROLE', 'LEAGUE_REMOVED', 'PICK_REMINDER', 'MATCH_RESULT', 'CHAMPION_RESULT', 'BEST_SCORER_RESULT');--> statement-breakpoint
CREATE TABLE "user_notification" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"type" "notification_type" NOT NULL,
	"data" jsonb NOT NULL,
	"dedupe_key" text,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_notification" ADD CONSTRAINT "user_notification_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_notification_user_created_idx" ON "user_notification" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "user_notification_user_dedupe_uq" ON "user_notification" USING btree ("user_id","dedupe_key") WHERE "user_notification"."dedupe_key" is not null;