CREATE TABLE "chat_identity" (
	"user_id" text PRIMARY KEY NOT NULL,
	"public_key" text NOT NULL,
	"recovery_wrapped_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_message" (
	"id" text PRIMARY KEY NOT NULL,
	"league_id" text NOT NULL,
	"match_id" text,
	"user_id" text,
	"epoch" integer NOT NULL,
	"ciphertext" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "league_chat_key" (
	"id" text PRIMARY KEY NOT NULL,
	"league_id" text NOT NULL,
	"user_id" text NOT NULL,
	"epoch" integer NOT NULL,
	"wrapped_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "league" ADD COLUMN "chat_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "league" ADD COLUMN "chat_enabled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "league" ADD COLUMN "chat_enabled_by" text;--> statement-breakpoint
ALTER TABLE "league" ADD COLUMN "chat_key_epoch" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_identity" ADD CONSTRAINT "chat_identity_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_message" ADD CONSTRAINT "chat_message_league_id_league_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."league"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_message" ADD CONSTRAINT "chat_message_match_id_match_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."match"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_message" ADD CONSTRAINT "chat_message_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league_chat_key" ADD CONSTRAINT "league_chat_key_league_id_league_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."league"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league_chat_key" ADD CONSTRAINT "league_chat_key_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chat_message_room_idx" ON "chat_message" USING btree ("league_id","match_id","created_at");--> statement-breakpoint
CREATE INDEX "chat_message_league_idx" ON "chat_message" USING btree ("league_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "league_chat_key_member_epoch_uq" ON "league_chat_key" USING btree ("league_id","user_id","epoch");--> statement-breakpoint
CREATE INDEX "league_chat_key_league_epoch_idx" ON "league_chat_key" USING btree ("league_id","epoch");--> statement-breakpoint
ALTER TABLE "league" ADD CONSTRAINT "league_chat_enabled_by_user_id_fk" FOREIGN KEY ("chat_enabled_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;