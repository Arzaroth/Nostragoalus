CREATE TYPE "public"."roadmap_status" AS ENUM('PLANNED', 'IN_PROGRESS', 'SHIPPED');--> statement-breakpoint
CREATE TABLE "roadmap_item" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"status" "roadmap_status" DEFAULT 'PLANNED' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "roadmap_item_status_position_idx" ON "roadmap_item" USING btree ("status","position");