CREATE TABLE "chat_message_reaction" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"message_id" text NOT NULL,
	"emoji" "reaction_emoji" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chat_message_reaction" ADD CONSTRAINT "chat_message_reaction_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_message_reaction" ADD CONSTRAINT "chat_message_reaction_message_id_chat_message_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."chat_message"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "chat_message_reaction_user_message_uq" ON "chat_message_reaction" USING btree ("user_id","message_id");--> statement-breakpoint
CREATE INDEX "chat_message_reaction_message_idx" ON "chat_message_reaction" USING btree ("message_id");