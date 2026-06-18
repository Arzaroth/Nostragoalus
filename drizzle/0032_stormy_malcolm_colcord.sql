CREATE TYPE "public"."reaction_emoji" AS ENUM('FIRE', 'GOAL', 'WOW', 'LAUGH', 'SAD', 'ANGRY');--> statement-breakpoint
CREATE TABLE "match_reaction" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"match_id" text NOT NULL,
	"emoji" "reaction_emoji" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "match_reaction" ADD CONSTRAINT "match_reaction_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_reaction" ADD CONSTRAINT "match_reaction_match_id_match_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."match"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "match_reaction_user_match_uq" ON "match_reaction" USING btree ("user_id","match_id");--> statement-breakpoint
CREATE INDEX "match_reaction_match_idx" ON "match_reaction" USING btree ("match_id");--> statement-breakpoint
CREATE INDEX "match_reaction_user_idx" ON "match_reaction" USING btree ("user_id");