CREATE TYPE "public"."league_reward_criterion" AS ENUM('OVERALL', 'WOODEN_SPOON', 'GROUP_PHASE', 'KNOCKOUT_PHASE', 'FINALIST', 'MADAME_IRMA', 'GROUP_ORACLE', 'KNOCKOUT_ORACLE', 'SHARPSHOOTER', 'GOAL_DIFF_GURU', 'TEAM_SPECIALIST');--> statement-breakpoint
ALTER TABLE "league_reward" ALTER COLUMN "type" SET DATA TYPE "public"."league_reward_criterion" USING "type"::text::"public"."league_reward_criterion";--> statement-breakpoint
ALTER TABLE "league" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "league" ADD COLUMN "featured_team_code" text;--> statement-breakpoint
ALTER TABLE "competition" DROP COLUMN "featured_team_code";