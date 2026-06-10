DROP INDEX "odds_snapshot_match_fetched_idx";--> statement-breakpoint
ALTER TABLE "match" ADD COLUMN "odds_checked_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "odds_snapshot_match_fetched_idx" ON "odds_snapshot" USING btree ("match_id","fetched_at" DESC NULLS LAST);--> statement-breakpoint
-- One-time backfill replacing the runtime re-seeding that ensureDefaultCompetition
-- used to do: rows that predate the odds columns get the defaults, while an
-- admin clearing them later now genuinely disables odds for that competition.
UPDATE "competition" SET "odds_provider" = 'sofascore', "odds_provider_ref" = '16'
  WHERE "slug" IN ('world-cup-2026', 'world-cup-2022') AND "odds_provider" IS NULL AND "odds_provider_ref" IS NULL;--> statement-breakpoint
UPDATE "competition" SET "odds_provider" = 'sofascore', "odds_provider_ref" = '1'
  WHERE "slug" = 'euro-2024' AND "odds_provider" IS NULL AND "odds_provider_ref" IS NULL;
