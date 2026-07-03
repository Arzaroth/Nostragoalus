CREATE TABLE "showcase_pin" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"competition_id" text NOT NULL,
	"achievement_key" text NOT NULL,
	"slot" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP TABLE "fridge_pin" CASCADE;--> statement-breakpoint
ALTER TABLE "showcase_pin" ADD CONSTRAINT "showcase_pin_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "showcase_pin" ADD CONSTRAINT "showcase_pin_competition_id_competition_id_fk" FOREIGN KEY ("competition_id") REFERENCES "public"."competition"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "showcase_pin_user_comp_slot_uq" ON "showcase_pin" USING btree ("user_id","competition_id","slot");--> statement-breakpoint
CREATE UNIQUE INDEX "showcase_pin_user_comp_ach_uq" ON "showcase_pin" USING btree ("user_id","competition_id","achievement_key");--> statement-breakpoint
DROP TYPE "public"."fridge_item_type";