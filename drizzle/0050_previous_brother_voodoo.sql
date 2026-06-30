CREATE TYPE "public"."sso_provider_status" AS ENUM('draft', 'enabled', 'disabled');--> statement-breakpoint
CREATE TABLE "scim_provider" (
	"id" text PRIMARY KEY NOT NULL,
	"provider_id" text NOT NULL,
	"scim_token" text NOT NULL,
	"organization_id" text,
	CONSTRAINT "scim_provider_provider_id_unique" UNIQUE("provider_id"),
	CONSTRAINT "scim_provider_scim_token_unique" UNIQUE("scim_token")
);
--> statement-breakpoint
ALTER TABLE "sso_provider" ADD COLUMN "status" "sso_provider_status" DEFAULT 'enabled' NOT NULL;--> statement-breakpoint
ALTER TABLE "sso_provider" ADD COLUMN "last_tested_at" timestamp;--> statement-breakpoint
ALTER TABLE "sso_provider" ADD COLUMN "last_test_result" jsonb;--> statement-breakpoint
CREATE INDEX "scim_provider_provider_id_idx" ON "scim_provider" USING btree ("provider_id");