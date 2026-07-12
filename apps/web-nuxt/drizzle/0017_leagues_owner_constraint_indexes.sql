CREATE INDEX "league_leaderboard_rank_user_idx" ON "league_leaderboard_rank" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "league_member_one_owner_uq" ON "league_member" USING btree ("league_id") WHERE "league_member"."role" = 'OWNER';--> statement-breakpoint
CREATE INDEX "league_opt_out_user_idx" ON "league_opt_out" USING btree ("user_id");