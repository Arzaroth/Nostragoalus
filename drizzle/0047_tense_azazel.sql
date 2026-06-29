ALTER TYPE "public"."notification_type" ADD VALUE 'CHAT_MENTION';--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "push_mentions" boolean;