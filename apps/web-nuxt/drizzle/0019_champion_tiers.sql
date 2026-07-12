ALTER TABLE "champion_pick" ADD COLUMN "fifa_rank" integer;--> statement-breakpoint
ALTER TABLE "champion_pick" ADD COLUMN "potential_points" integer DEFAULT 10 NOT NULL;--> statement-breakpoint
ALTER TABLE "scoring_config" ADD COLUMN "champion_tiers" jsonb;