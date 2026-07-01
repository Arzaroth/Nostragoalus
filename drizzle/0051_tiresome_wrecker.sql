CREATE TYPE "public"."achievement_tier" AS ENUM('BRONZE', 'SILVER', 'GOLD');--> statement-breakpoint
CREATE TYPE "public"."competition_award_type" AS ENUM('OVERALL', 'GROUP_PHASE', 'KNOCKOUT_PHASE', 'MADAME_IRMA', 'TEAM_SPECIALIST');--> statement-breakpoint
CREATE TYPE "public"."fridge_item_type" AS ENUM('TROPHY', 'ACHIEVEMENT');--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'TROPHY_AWARDED' BEFORE 'CHAT_MENTION';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'ACHIEVEMENT_UNLOCKED' BEFORE 'CHAT_MENTION';--> statement-breakpoint
CREATE TABLE "competition_award" (
	"id" text PRIMARY KEY NOT NULL,
	"competition_id" text NOT NULL,
	"user_id" text NOT NULL,
	"type" "competition_award_type" NOT NULL,
	"value" integer DEFAULT 0 NOT NULL,
	"team_code" text,
	"awarded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fridge_pin" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"competition_id" text NOT NULL,
	"item_type" "fridge_item_type" NOT NULL,
	"item_key" text NOT NULL,
	"slot" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_achievement" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"competition_id" text,
	"key" text NOT NULL,
	"tier" "achievement_tier",
	"progress" integer DEFAULT 0 NOT NULL,
	"unlocked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "competition" ADD COLUMN "featured_team_code" text;--> statement-breakpoint
ALTER TABLE "competition_award" ADD CONSTRAINT "competition_award_competition_id_competition_id_fk" FOREIGN KEY ("competition_id") REFERENCES "public"."competition"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition_award" ADD CONSTRAINT "competition_award_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fridge_pin" ADD CONSTRAINT "fridge_pin_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fridge_pin" ADD CONSTRAINT "fridge_pin_competition_id_competition_id_fk" FOREIGN KEY ("competition_id") REFERENCES "public"."competition"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_achievement" ADD CONSTRAINT "user_achievement_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_achievement" ADD CONSTRAINT "user_achievement_competition_id_competition_id_fk" FOREIGN KEY ("competition_id") REFERENCES "public"."competition"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "competition_award_user_type_uq" ON "competition_award" USING btree ("competition_id","user_id","type");--> statement-breakpoint
CREATE INDEX "competition_award_competition_type_idx" ON "competition_award" USING btree ("competition_id","type");--> statement-breakpoint
CREATE INDEX "competition_award_user_idx" ON "competition_award" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "fridge_pin_user_comp_slot_uq" ON "fridge_pin" USING btree ("user_id","competition_id","slot");--> statement-breakpoint
CREATE UNIQUE INDEX "fridge_pin_user_comp_item_uq" ON "fridge_pin" USING btree ("user_id","competition_id","item_type","item_key");--> statement-breakpoint
CREATE UNIQUE INDEX "user_achievement_user_comp_key_uq" ON "user_achievement" USING btree ("user_id",coalesce("competition_id", ''),"key");--> statement-breakpoint
CREATE INDEX "user_achievement_user_idx" ON "user_achievement" USING btree ("user_id");