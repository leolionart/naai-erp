ALTER TABLE "organizations" ADD COLUMN "tax_id" text;
--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "registered_address" text;
--> statement-breakpoint
ALTER TABLE "parties" ADD COLUMN "legal_name" text;
--> statement-breakpoint
ALTER TABLE "parties" ADD COLUMN "registered_address" text;
--> statement-breakpoint
ALTER TABLE "parties" ADD COLUMN "email" text;
--> statement-breakpoint
ALTER TABLE "parties" ADD COLUMN "phone" text;
--> statement-breakpoint
ALTER TABLE "parties" ADD COLUMN "website" text;
--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_tax_id_not_blank" CHECK ("tax_id" is null or btrim("tax_id") <> '');
--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_registered_address_not_blank" CHECK ("registered_address" is null or btrim("registered_address") <> '');
--> statement-breakpoint
ALTER TABLE "parties" ADD CONSTRAINT "parties_legal_name_not_blank" CHECK ("legal_name" is null or btrim("legal_name") <> '');
--> statement-breakpoint
ALTER TABLE "parties" ADD CONSTRAINT "parties_registered_address_not_blank" CHECK ("registered_address" is null or btrim("registered_address") <> '');
--> statement-breakpoint
ALTER TABLE "parties" ADD CONSTRAINT "parties_email_valid" CHECK ("email" is null or "email" ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$');
--> statement-breakpoint
ALTER TABLE "parties" ADD CONSTRAINT "parties_phone_not_blank" CHECK ("phone" is null or btrim("phone") <> '');
--> statement-breakpoint
ALTER TABLE "parties" ADD CONSTRAINT "parties_website_valid" CHECK ("website" is null or "website" ~* '^https?://[^[:space:]]+$');
