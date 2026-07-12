ALTER TABLE "chat_attachment" ADD COLUMN "idx" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_attachment" ADD COLUMN "epoch" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_attachment" DROP CONSTRAINT "chat_attachment_pkey";--> statement-breakpoint
ALTER TABLE "chat_attachment" ADD CONSTRAINT "chat_attachment_message_id_idx_pk" PRIMARY KEY("message_id","idx");
