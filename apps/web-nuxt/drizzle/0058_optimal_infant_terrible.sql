CREATE TYPE "public"."league_mode" AS ENUM('NORMAL', 'EASY', 'HARD', 'HARDCORE');--> statement-breakpoint
CREATE TABLE "league_prediction" (
	"id" text PRIMARY KEY NOT NULL,
	"league_id" text NOT NULL,
	"user_id" text NOT NULL,
	"match_id" text NOT NULL,
	"round_id" text NOT NULL,
	"home_goals" integer NOT NULL,
	"away_goals" integer NOT NULL,
	"is_outcome_only" boolean DEFAULT false NOT NULL,
	"wager" integer,
	"is_joker" boolean DEFAULT false NOT NULL,
	"locked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "league_prediction_commitment" (
	"seq" integer PRIMARY KEY NOT NULL,
	"league_prediction_id" text NOT NULL,
	"league_id" text NOT NULL,
	"user_id" text NOT NULL,
	"subject" text NOT NULL,
	"match_id" text NOT NULL,
	"home_goals" integer NOT NULL,
	"away_goals" integer NOT NULL,
	"salt" text NOT NULL,
	"commitment" text NOT NULL,
	"prev_hash" text NOT NULL,
	"entry_hash" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "league" ADD COLUMN "mode" "league_mode" DEFAULT 'NORMAL' NOT NULL;--> statement-breakpoint
ALTER TABLE "league" ADD COLUMN "lives" integer;--> statement-breakpoint
ALTER TABLE "league_member" ADD COLUMN "picks_synced" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "prediction" ADD COLUMN "is_outcome_only" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "prediction" ADD COLUMN "wager" integer;--> statement-breakpoint
ALTER TABLE "league_prediction" ADD CONSTRAINT "league_prediction_league_id_league_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."league"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league_prediction" ADD CONSTRAINT "league_prediction_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league_prediction" ADD CONSTRAINT "league_prediction_match_id_match_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."match"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league_prediction" ADD CONSTRAINT "league_prediction_round_id_round_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."round"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "league_prediction_league_user_match_uq" ON "league_prediction" USING btree ("league_id","user_id","match_id");--> statement-breakpoint
CREATE UNIQUE INDEX "league_prediction_league_user_round_joker_uq" ON "league_prediction" USING btree ("league_id","user_id","round_id") WHERE "league_prediction"."is_joker" = true;--> statement-breakpoint
CREATE INDEX "league_prediction_match_idx" ON "league_prediction" USING btree ("match_id");--> statement-breakpoint
CREATE INDEX "league_prediction_league_user_idx" ON "league_prediction" USING btree ("league_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "league_prediction_commitment_entry_hash_uq" ON "league_prediction_commitment" USING btree ("entry_hash");--> statement-breakpoint
CREATE INDEX "league_prediction_commitment_match_idx" ON "league_prediction_commitment" USING btree ("match_id");--> statement-breakpoint
CREATE INDEX "league_prediction_commitment_league_idx" ON "league_prediction_commitment" USING btree ("league_id");