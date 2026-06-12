CREATE TABLE "league_invite" (
	"id" text PRIMARY KEY NOT NULL,
	"league_id" text NOT NULL,
	"token" text NOT NULL,
	"created_by" text,
	"expires_at" timestamp with time zone,
	"max_uses" integer,
	"uses" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "league_invite" ADD CONSTRAINT "league_invite_league_id_league_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."league"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league_invite" ADD CONSTRAINT "league_invite_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "league_invite_token_uq" ON "league_invite" USING btree ("token");--> statement-breakpoint
CREATE INDEX "league_invite_league_idx" ON "league_invite" USING btree ("league_id");