CREATE TYPE "public"."sport" AS ENUM('FOOTBALL', 'RUGBY_UNION');--> statement-breakpoint
ALTER TABLE "competition" ADD COLUMN "sport" "sport" DEFAULT 'FOOTBALL' NOT NULL;--> statement-breakpoint
ALTER TABLE "competition" ADD COLUMN "provider_sport" text;