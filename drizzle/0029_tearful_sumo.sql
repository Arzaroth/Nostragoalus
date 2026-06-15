CREATE TABLE "push_subscription" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "push_reminders" boolean;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "push_kickoff" boolean;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "push_goals" boolean;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "push_match_results" boolean;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "push_tournament" boolean;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "push_league" boolean;--> statement-breakpoint
ALTER TABLE "push_subscription" ADD CONSTRAINT "push_subscription_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "push_subscription_endpoint_uq" ON "push_subscription" USING btree ("endpoint");--> statement-breakpoint
CREATE INDEX "push_subscription_user_idx" ON "push_subscription" USING btree ("user_id");