CREATE TABLE "commitment_chain_head" (
	"id" text PRIMARY KEY NOT NULL,
	"seq" integer NOT NULL,
	"head_hash" text NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prediction_commitment" (
	"seq" integer PRIMARY KEY NOT NULL,
	"prediction_id" text NOT NULL,
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
CREATE UNIQUE INDEX "prediction_commitment_entry_hash_uq" ON "prediction_commitment" USING btree ("entry_hash");--> statement-breakpoint
CREATE INDEX "prediction_commitment_match_idx" ON "prediction_commitment" USING btree ("match_id");--> statement-breakpoint
CREATE INDEX "prediction_commitment_user_idx" ON "prediction_commitment" USING btree ("user_id");