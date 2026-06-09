CREATE TABLE "odds_snapshot" (
	"id" text PRIMARY KEY NOT NULL,
	"match_id" text NOT NULL,
	"provider" text NOT NULL,
	"provider_event_ref" text NOT NULL,
	"kind" text DEFAULT 'POLL' NOT NULL,
	"odds_home" numeric(7, 3) NOT NULL,
	"odds_draw" numeric(7, 3) NOT NULL,
	"odds_away" numeric(7, 3) NOT NULL,
	"initial_home" numeric(7, 3),
	"initial_draw" numeric(7, 3),
	"initial_away" numeric(7, 3),
	"bookmakers" jsonb,
	"fetched_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "competition" ADD COLUMN "odds_provider" text;--> statement-breakpoint
ALTER TABLE "competition" ADD COLUMN "odds_provider_ref" text;--> statement-breakpoint
ALTER TABLE "match" ADD COLUMN "odds_event_ref" text;--> statement-breakpoint
ALTER TABLE "odds_snapshot" ADD CONSTRAINT "odds_snapshot_match_id_match_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."match"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "odds_snapshot_match_fetched_idx" ON "odds_snapshot" USING btree ("match_id","fetched_at");