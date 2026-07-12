ALTER TABLE "chat_attachment" ALTER COLUMN "ciphertext" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_attachment" ADD COLUMN "storage_key" text;--> statement-breakpoint
ALTER TABLE "chat_attachment" ADD CONSTRAINT "chat_attachment_blob_xor" CHECK (num_nonnulls("chat_attachment"."ciphertext", "chat_attachment"."storage_key") = 1);