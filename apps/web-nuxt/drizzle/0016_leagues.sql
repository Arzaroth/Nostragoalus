CREATE TYPE "public"."league_role" AS ENUM('OWNER', 'MODERATOR', 'MEMBER');--> statement-breakpoint
CREATE TYPE "public"."league_visibility" AS ENUM('PRIVATE', 'PUBLIC');--> statement-breakpoint
CREATE TABLE "league" (
	"id" text PRIMARY KEY NOT NULL,
	"competition_id" text NOT NULL,
	"name" text NOT NULL,
	"visibility" "league_visibility" DEFAULT 'PRIVATE' NOT NULL,
	"join_code" text NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "league_leaderboard_rank" (
	"league_id" text NOT NULL,
	"user_id" text NOT NULL,
	"rank" integer NOT NULL,
	"prev_rank" integer,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "league_leaderboard_rank_league_id_user_id_pk" PRIMARY KEY("league_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "league_member" (
	"league_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" "league_role" DEFAULT 'MEMBER' NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "league_member_league_id_user_id_pk" PRIMARY KEY("league_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "league_opt_out" (
	"league_id" text NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "league_opt_out_league_id_user_id_pk" PRIMARY KEY("league_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "sso_provider_league" (
	"provider_id" text NOT NULL,
	"league_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sso_provider_league_provider_id_league_id_pk" PRIMARY KEY("provider_id","league_id")
);
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "profile_private" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "league_prompt_dismissed_at" timestamp;--> statement-breakpoint
ALTER TABLE "league" ADD CONSTRAINT "league_competition_id_competition_id_fk" FOREIGN KEY ("competition_id") REFERENCES "public"."competition"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league" ADD CONSTRAINT "league_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league_leaderboard_rank" ADD CONSTRAINT "league_leaderboard_rank_league_id_league_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."league"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league_leaderboard_rank" ADD CONSTRAINT "league_leaderboard_rank_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league_member" ADD CONSTRAINT "league_member_league_id_league_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."league"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league_member" ADD CONSTRAINT "league_member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league_opt_out" ADD CONSTRAINT "league_opt_out_league_id_league_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."league"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league_opt_out" ADD CONSTRAINT "league_opt_out_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sso_provider_league" ADD CONSTRAINT "sso_provider_league_provider_id_sso_provider_provider_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."sso_provider"("provider_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sso_provider_league" ADD CONSTRAINT "sso_provider_league_league_id_league_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."league"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "league_join_code_uq" ON "league" USING btree ("join_code");--> statement-breakpoint
CREATE INDEX "league_competition_idx" ON "league" USING btree ("competition_id");--> statement-breakpoint
CREATE INDEX "league_member_user_idx" ON "league_member" USING btree ("user_id");