CREATE TABLE "chat_room_read" (
	"user_id" text NOT NULL,
	"league_id" text NOT NULL,
	"room_key" text NOT NULL,
	"last_read_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chat_room_read_user_id_league_id_room_key_pk" PRIMARY KEY("user_id","league_id","room_key")
);
--> statement-breakpoint
ALTER TABLE "chat_room_read" ADD CONSTRAINT "chat_room_read_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_room_read" ADD CONSTRAINT "chat_room_read_league_id_league_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."league"("id") ON DELETE cascade ON UPDATE no action;