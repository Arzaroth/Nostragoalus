CREATE TYPE "public"."base_tier" AS ENUM('EXACT', 'DIFF', 'OUTCOME', 'MISS');--> statement-breakpoint
CREATE TYPE "public"."bonus_source" AS ENUM('NONE', 'CROWD', 'ODDS');--> statement-breakpoint
CREATE TYPE "public"."match_scoring_state" AS ENUM('PENDING', 'SCORED', 'VOID', 'STALE');--> statement-breakpoint
CREATE TYPE "public"."match_status" AS ENUM('SCHEDULED', 'LIVE', 'PAUSED', 'FINISHED', 'POSTPONED', 'CANCELLED', 'SUSPENDED', 'AWARDED');--> statement-breakpoint
CREATE TYPE "public"."outcome" AS ENUM('HOME', 'DRAW', 'AWAY');--> statement-breakpoint
CREATE TYPE "public"."round_kind" AS ENUM('GROUP_MATCHDAY', 'KNOCKOUT');--> statement-breakpoint
CREATE TYPE "public"."stage" AS ENUM('GROUP', 'R32', 'R16', 'QF', 'SF', 'THIRD_PLACE', 'FINAL');--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "champion_pick" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"competition_id" text NOT NULL,
	"team_code" text,
	"team_name" text NOT NULL,
	"awarded_points" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "competition" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"provider" text NOT NULL,
	"external_competition_id" text NOT NULL,
	"external_season_id" text,
	"season_hint" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "match" (
	"id" text PRIMARY KEY NOT NULL,
	"competition_id" text NOT NULL,
	"provider_match_id" text NOT NULL,
	"round_id" text NOT NULL,
	"stage" "stage" NOT NULL,
	"group_name" text,
	"home_team" text NOT NULL,
	"away_team" text NOT NULL,
	"home_team_code" text,
	"away_team_code" text,
	"kickoff_time" timestamp with time zone NOT NULL,
	"status" "match_status" DEFAULT 'SCHEDULED' NOT NULL,
	"full_time_home" integer,
	"full_time_away" integer,
	"half_time_home" integer,
	"half_time_away" integer,
	"extra_time_home" integer,
	"extra_time_away" integer,
	"penalties_home" integer,
	"penalties_away" integer,
	"winner" "outcome",
	"scoring_state" "match_scoring_state" DEFAULT 'PENDING' NOT NULL,
	"scored_at_version" integer,
	"scored_at" timestamp with time zone,
	"result_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "match_score_event" (
	"id" text PRIMARY KEY NOT NULL,
	"match_id" text NOT NULL,
	"status" "match_status" NOT NULL,
	"full_time_home" integer,
	"full_time_away" integer,
	"result_hash" text NOT NULL,
	"observed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prediction" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"match_id" text NOT NULL,
	"round_id" text NOT NULL,
	"home_goals" integer NOT NULL,
	"away_goals" integer NOT NULL,
	"is_joker" boolean DEFAULT false NOT NULL,
	"locked_at" timestamp with time zone,
	"base_points" integer,
	"base_tier" "base_tier",
	"bonus_points" integer,
	"bonus_source" "bonus_source",
	"crowd_share" numeric(6, 5),
	"joker_multiplier_applied" numeric(4, 2),
	"total_points" integer,
	"scored_at_version" integer,
	"scored_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "round" (
	"id" text PRIMARY KEY NOT NULL,
	"competition_id" text NOT NULL,
	"kind" "round_kind" NOT NULL,
	"stage" "stage" NOT NULL,
	"matchday" integer,
	"label" text NOT NULL,
	"sort_order" integer NOT NULL,
	"opens_at" timestamp with time zone,
	"first_kickoff_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "scoring_config" (
	"id" text PRIMARY KEY NOT NULL,
	"version" integer NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"pts_exact" integer DEFAULT 3 NOT NULL,
	"pts_diff" integer DEFAULT 2 NOT NULL,
	"pts_outcome" integer DEFAULT 1 NOT NULL,
	"pts_miss" integer DEFAULT 0 NOT NULL,
	"joker_multiplier" numeric(4, 2) DEFAULT '2' NOT NULL,
	"joker_applies_to_bonus" boolean DEFAULT true NOT NULL,
	"champion_bonus" integer DEFAULT 10 NOT NULL,
	"bonus_source" "bonus_source" DEFAULT 'CROWD' NOT NULL,
	"crowd_tiers" jsonb NOT NULL,
	"crowd_match_basis" text DEFAULT 'EXACT' NOT NULL,
	"crowd_min_denominator" integer DEFAULT 5 NOT NULL,
	"odds_tiers" jsonb,
	"odds_applies_to" text DEFAULT 'OUTCOME',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_profile" (
	"user_id" text PRIMARY KEY NOT NULL,
	"display_name" text NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"cached_total_points" integer DEFAULT 0 NOT NULL,
	"cached_exact_count" integer DEFAULT 0 NOT NULL,
	"cached_outcome_count" integer DEFAULT 0 NOT NULL,
	"cached_gd_count" integer DEFAULT 0 NOT NULL,
	"cached_rank_updated_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "champion_pick" ADD CONSTRAINT "champion_pick_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "champion_pick" ADD CONSTRAINT "champion_pick_competition_id_competition_id_fk" FOREIGN KEY ("competition_id") REFERENCES "public"."competition"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match" ADD CONSTRAINT "match_competition_id_competition_id_fk" FOREIGN KEY ("competition_id") REFERENCES "public"."competition"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match" ADD CONSTRAINT "match_round_id_round_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."round"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_score_event" ADD CONSTRAINT "match_score_event_match_id_match_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."match"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prediction" ADD CONSTRAINT "prediction_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prediction" ADD CONSTRAINT "prediction_match_id_match_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."match"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prediction" ADD CONSTRAINT "prediction_round_id_round_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."round"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "round" ADD CONSTRAINT "round_competition_id_competition_id_fk" FOREIGN KEY ("competition_id") REFERENCES "public"."competition"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_profile" ADD CONSTRAINT "user_profile_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_userId_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_userId_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE UNIQUE INDEX "champion_pick_user_competition_uq" ON "champion_pick" USING btree ("user_id","competition_id");--> statement-breakpoint
CREATE UNIQUE INDEX "competition_slug_uq" ON "competition" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "match_provider_uq" ON "match" USING btree ("competition_id","provider_match_id");--> statement-breakpoint
CREATE INDEX "match_competition_idx" ON "match" USING btree ("competition_id");--> statement-breakpoint
CREATE INDEX "match_kickoff_idx" ON "match" USING btree ("kickoff_time");--> statement-breakpoint
CREATE INDEX "match_round_idx" ON "match" USING btree ("round_id");--> statement-breakpoint
CREATE INDEX "match_stage_idx" ON "match" USING btree ("stage");--> statement-breakpoint
CREATE INDEX "match_scoring_state_idx" ON "match" USING btree ("scoring_state");--> statement-breakpoint
CREATE INDEX "mse_match_idx" ON "match_score_event" USING btree ("match_id");--> statement-breakpoint
CREATE UNIQUE INDEX "prediction_user_match_uq" ON "prediction" USING btree ("user_id","match_id");--> statement-breakpoint
CREATE UNIQUE INDEX "prediction_user_round_joker_uq" ON "prediction" USING btree ("user_id","round_id") WHERE "prediction"."is_joker" = true;--> statement-breakpoint
CREATE INDEX "prediction_match_idx" ON "prediction" USING btree ("match_id");--> statement-breakpoint
CREATE INDEX "prediction_user_idx" ON "prediction" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "prediction_match_locked_idx" ON "prediction" USING btree ("match_id","locked_at");--> statement-breakpoint
CREATE INDEX "prediction_user_total_idx" ON "prediction" USING btree ("user_id","total_points");--> statement-breakpoint
CREATE UNIQUE INDEX "round_competition_sort_uq" ON "round" USING btree ("competition_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "round_competition_stage_matchday_uq" ON "round" USING btree ("competition_id","stage","matchday");--> statement-breakpoint
CREATE UNIQUE INDEX "scoring_config_version_uq" ON "scoring_config" USING btree ("version");--> statement-breakpoint
CREATE UNIQUE INDEX "scoring_config_one_active_uq" ON "scoring_config" USING btree ("is_active") WHERE "scoring_config"."is_active" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "user_profile_display_name_uq" ON "user_profile" USING btree (lower("display_name"));