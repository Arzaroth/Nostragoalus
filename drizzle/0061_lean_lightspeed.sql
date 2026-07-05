CREATE TABLE "key_transparency_entry" (
	"seq" integer PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"public_key" text NOT NULL,
	"prev_hash" text NOT NULL,
	"entry_hash" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "key_transparency_head" (
	"id" text PRIMARY KEY NOT NULL,
	"seq" integer NOT NULL,
	"head_hash" text NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "key_transparency_entry_hash_uq" ON "key_transparency_entry" USING btree ("entry_hash");--> statement-breakpoint
CREATE INDEX "key_transparency_entry_user_idx" ON "key_transparency_entry" USING btree ("user_id");