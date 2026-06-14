CREATE TYPE "public"."match_media_kind" AS ENUM('LIVE', 'REPLAY', 'HIGHLIGHTS');--> statement-breakpoint
CREATE TABLE "match_media" (
	"id" text PRIMARY KEY NOT NULL,
	"match_id" text NOT NULL,
	"kind" "match_media_kind" NOT NULL,
	"url" text NOT NULL,
	"label" text,
	"embeddable" boolean,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "match_media" ADD CONSTRAINT "match_media_match_id_match_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."match"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "match_media_match_idx" ON "match_media" USING btree ("match_id","kind");