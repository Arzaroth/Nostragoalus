DROP INDEX "scoring_config_one_active_uq";--> statement-breakpoint
ALTER TABLE "scoring_config" ADD COLUMN "competition_id" text;--> statement-breakpoint
ALTER TABLE "scoring_config" ADD COLUMN "crowd_outcome_tiers" jsonb;--> statement-breakpoint
ALTER TABLE "scoring_config" ADD CONSTRAINT "scoring_config_competition_id_competition_id_fk" FOREIGN KEY ("competition_id") REFERENCES "public"."competition"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "scoring_config_active_scope_uq" ON "scoring_config" USING btree (coalesce("competition_id", '')) WHERE "scoring_config"."is_active" = true;