ALTER TABLE "best_scorer_pick" ADD COLUMN "repicked" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "best_scorer_pick" ADD COLUMN "original_player_name" text;--> statement-breakpoint
ALTER TABLE "best_scorer_pick" ADD COLUMN "original_team_code" text;--> statement-breakpoint
ALTER TABLE "champion_pick" ADD COLUMN "repicked" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "champion_pick" ADD COLUMN "original_team_code" text;--> statement-breakpoint
ALTER TABLE "champion_pick" ADD COLUMN "original_team_name" text;