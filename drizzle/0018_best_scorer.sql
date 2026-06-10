CREATE TABLE "best_scorer_pick" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"competition_id" text NOT NULL,
	"player_id" text NOT NULL,
	"player_name" text NOT NULL,
	"team_code" text,
	"team_name" text NOT NULL,
	"awarded_points" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "scoring_config" ADD COLUMN "best_scorer_bonus" integer DEFAULT 10 NOT NULL;--> statement-breakpoint
ALTER TABLE "best_scorer_pick" ADD CONSTRAINT "best_scorer_pick_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "best_scorer_pick" ADD CONSTRAINT "best_scorer_pick_competition_id_competition_id_fk" FOREIGN KEY ("competition_id") REFERENCES "public"."competition"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "best_scorer_pick_user_competition_uq" ON "best_scorer_pick" USING btree ("user_id","competition_id");