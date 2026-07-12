ALTER TYPE "public"."notification_type" ADD VALUE 'DM_MESSAGE';--> statement-breakpoint
CREATE TABLE "dm_thread" (
	"id" text PRIMARY KEY NOT NULL,
	"user_a_id" text NOT NULL,
	"user_b_id" text NOT NULL,
	"key_epoch" integer DEFAULT 1 NOT NULL,
	"last_message_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dm_thread_order" CHECK ("dm_thread"."user_a_id" COLLATE "C" < "dm_thread"."user_b_id" COLLATE "C")
);
--> statement-breakpoint
CREATE TABLE "dm_thread_key" (
	"id" text PRIMARY KEY NOT NULL,
	"thread_id" text NOT NULL,
	"user_id" text NOT NULL,
	"epoch" integer NOT NULL,
	"wrapped_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dm_thread_read" (
	"user_id" text NOT NULL,
	"thread_id" text NOT NULL,
	"last_read_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dm_thread_read_user_id_thread_id_pk" PRIMARY KEY("user_id","thread_id")
);
--> statement-breakpoint
ALTER TABLE "chat_message" ALTER COLUMN "league_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "push_dm" boolean;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "dm_discoverable" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_message" ADD COLUMN "dm_thread_id" text;--> statement-breakpoint
ALTER TABLE "dm_thread" ADD CONSTRAINT "dm_thread_user_a_id_user_id_fk" FOREIGN KEY ("user_a_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dm_thread" ADD CONSTRAINT "dm_thread_user_b_id_user_id_fk" FOREIGN KEY ("user_b_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dm_thread_key" ADD CONSTRAINT "dm_thread_key_thread_id_dm_thread_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."dm_thread"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dm_thread_key" ADD CONSTRAINT "dm_thread_key_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dm_thread_read" ADD CONSTRAINT "dm_thread_read_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dm_thread_read" ADD CONSTRAINT "dm_thread_read_thread_id_dm_thread_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."dm_thread"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "dm_thread_pair_uq" ON "dm_thread" USING btree ("user_a_id","user_b_id");--> statement-breakpoint
CREATE INDEX "dm_thread_user_a_idx" ON "dm_thread" USING btree ("user_a_id","last_message_at");--> statement-breakpoint
CREATE INDEX "dm_thread_user_b_idx" ON "dm_thread" USING btree ("user_b_id","last_message_at");--> statement-breakpoint
CREATE UNIQUE INDEX "dm_thread_key_member_epoch_uq" ON "dm_thread_key" USING btree ("thread_id","user_id","epoch");--> statement-breakpoint
CREATE INDEX "dm_thread_key_thread_epoch_idx" ON "dm_thread_key" USING btree ("thread_id","epoch");--> statement-breakpoint
ALTER TABLE "chat_message" ADD CONSTRAINT "chat_message_dm_thread_id_dm_thread_id_fk" FOREIGN KEY ("dm_thread_id") REFERENCES "public"."dm_thread"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chat_message_dm_idx" ON "chat_message" USING btree ("dm_thread_id","created_at");--> statement-breakpoint
ALTER TABLE "chat_message" ADD CONSTRAINT "chat_message_scope_xor" CHECK (num_nonnulls("chat_message"."league_id", "chat_message"."dm_thread_id") = 1);