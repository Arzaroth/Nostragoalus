CREATE TYPE "public"."chat_moderation_state" AS ENUM('VISIBLE', 'PENDING', 'REMOVED');--> statement-breakpoint
CREATE TABLE "chat_message_report" (
	"id" text PRIMARY KEY NOT NULL,
	"message_id" text NOT NULL,
	"reporter_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chat_message" ADD COLUMN "moderation_state" "chat_moderation_state" DEFAULT 'VISIBLE' NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_message" ADD COLUMN "moderated_by" text;--> statement-breakpoint
ALTER TABLE "chat_message" ADD COLUMN "moderated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "chat_message_report" ADD CONSTRAINT "chat_message_report_message_id_chat_message_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."chat_message"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_message_report" ADD CONSTRAINT "chat_message_report_reporter_id_user_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "chat_message_report_message_reporter_uq" ON "chat_message_report" USING btree ("message_id","reporter_id");--> statement-breakpoint
CREATE INDEX "chat_message_report_message_idx" ON "chat_message_report" USING btree ("message_id");--> statement-breakpoint
ALTER TABLE "chat_message" ADD CONSTRAINT "chat_message_moderated_by_user_id_fk" FOREIGN KEY ("moderated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;