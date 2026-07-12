CREATE TABLE "league_reward" (
	"id" text PRIMARY KEY NOT NULL,
	"league_id" text NOT NULL,
	"type" "competition_award_type" NOT NULL,
	"label" text NOT NULL,
	"image_key" text,
	"note" text,
	"link" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "league_reward" ADD CONSTRAINT "league_reward_league_id_league_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."league"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "league_reward_league_type_uq" ON "league_reward" USING btree ("league_id","type");