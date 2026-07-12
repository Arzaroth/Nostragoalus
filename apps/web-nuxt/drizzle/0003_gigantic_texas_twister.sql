CREATE TABLE "leaderboard_rank" (
	"competition_id" text NOT NULL,
	"user_id" text NOT NULL,
	"rank" integer NOT NULL,
	"prev_rank" integer,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "leaderboard_rank_competition_id_user_id_pk" PRIMARY KEY("competition_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "leaderboard_rank" ADD CONSTRAINT "leaderboard_rank_competition_id_competition_id_fk" FOREIGN KEY ("competition_id") REFERENCES "public"."competition"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leaderboard_rank" ADD CONSTRAINT "leaderboard_rank_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;