ALTER TABLE "user" ADD COLUMN "skin" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "skins_unlocked" boolean DEFAULT false NOT NULL;