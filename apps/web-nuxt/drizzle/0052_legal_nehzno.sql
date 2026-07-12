CREATE TYPE "public"."roadmap_moderation" AS ENUM('PENDING', 'APPROVED', 'REJECTED');--> statement-breakpoint
ALTER TYPE "public"."roadmap_status" ADD VALUE 'SUGGESTED';--> statement-breakpoint
CREATE TABLE "roadmap_vote" (
	"id" text PRIMARY KEY NOT NULL,
	"roadmap_item_id" text NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "roadmap_item" ADD COLUMN "author_id" text;--> statement-breakpoint
ALTER TABLE "roadmap_item" ADD COLUMN "moderation_status" "roadmap_moderation" DEFAULT 'APPROVED' NOT NULL;--> statement-breakpoint
ALTER TABLE "roadmap_vote" ADD CONSTRAINT "roadmap_vote_roadmap_item_id_roadmap_item_id_fk" FOREIGN KEY ("roadmap_item_id") REFERENCES "public"."roadmap_item"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roadmap_vote" ADD CONSTRAINT "roadmap_vote_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "roadmap_vote_item_user_uq" ON "roadmap_vote" USING btree ("roadmap_item_id","user_id");--> statement-breakpoint
CREATE INDEX "roadmap_vote_item_idx" ON "roadmap_vote" USING btree ("roadmap_item_id");--> statement-breakpoint
CREATE INDEX "roadmap_vote_user_idx" ON "roadmap_vote" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "roadmap_item" ADD CONSTRAINT "roadmap_item_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "roadmap_item_author_idx" ON "roadmap_item" USING btree ("author_id");