CREATE TYPE "subscription_recurrence_frequency" AS ENUM ('month', 'quarter', 'year');
--> statement-breakpoint
CREATE TYPE "customer_subscription_lifecycle" AS ENUM ('draft', 'active', 'paused', 'cancelled', 'expired');
--> statement-breakpoint
CREATE TABLE "service_plans" (
 "organization_id" text NOT NULL, "id" text NOT NULL, "code" text NOT NULL, "name" text NOT NULL,
 "service_line_code" text NOT NULL, "default_unit_price_minor" bigint NOT NULL, "currency" text NOT NULL,
 "recurrence_frequency" "subscription_recurrence_frequency" NOT NULL, "recurrence_interval" integer NOT NULL,
 "billing_day" integer NOT NULL, "active" boolean DEFAULT true NOT NULL, "version" bigint DEFAULT 1 NOT NULL,
 "created_by" text NOT NULL, "updated_by" text NOT NULL, "created_at" timestamptz DEFAULT now() NOT NULL,
 "updated_at" timestamptz DEFAULT now() NOT NULL,
 CONSTRAINT "service_plans_organization_id_id_pk" PRIMARY KEY("organization_id","id"),
 CONSTRAINT "service_plans_org_code_unique" UNIQUE("organization_id","code"),
 CONSTRAINT "service_plans_code_not_blank" CHECK (btrim("code") <> ''), CONSTRAINT "service_plans_name_not_blank" CHECK (btrim("name") <> ''),
 CONSTRAINT "service_plans_price_nonnegative" CHECK ("default_unit_price_minor" >= 0), CONSTRAINT "service_plans_currency_iso3" CHECK ("currency" ~ '^[A-Z]{3}$'),
 CONSTRAINT "service_plans_recurrence_interval" CHECK ("recurrence_interval" between 1 and 120), CONSTRAINT "service_plans_billing_day" CHECK ("billing_day" between 1 and 31),
 CONSTRAINT "service_plans_version_positive" CHECK ("version" > 0)
);
--> statement-breakpoint
ALTER TABLE "service_plans" ADD CONSTRAINT "service_plans_organization_fk" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT;
--> statement-breakpoint
CREATE INDEX "service_plans_active_name_idx" ON "service_plans"("organization_id","active","name");
--> statement-breakpoint
CREATE TABLE "customer_service_subscriptions" (
 "organization_id" text NOT NULL, "id" text NOT NULL, "customer_party_id" text NOT NULL, "service_plan_id" text NOT NULL, "project_id" text,
 "starts_on" date NOT NULL, "ends_on" date, "quantity" bigint NOT NULL, "unit_price_minor" bigint NOT NULL, "currency" text NOT NULL,
 "recurrence_frequency" "subscription_recurrence_frequency" NOT NULL, "recurrence_interval" integer NOT NULL, "billing_day" integer NOT NULL,
 "lifecycle" "customer_subscription_lifecycle" DEFAULT 'draft' NOT NULL, "lifecycle_effective_on" date, "lifecycle_reason" text,
 "version" bigint DEFAULT 1 NOT NULL, "created_by" text NOT NULL, "updated_by" text NOT NULL,
 "created_at" timestamptz DEFAULT now() NOT NULL, "updated_at" timestamptz DEFAULT now() NOT NULL,
 CONSTRAINT "customer_service_subscriptions_organization_id_id_pk" PRIMARY KEY("organization_id","id"),
 CONSTRAINT "customer_subscriptions_quantity_positive" CHECK ("quantity" > 0), CONSTRAINT "customer_subscriptions_price_nonnegative" CHECK ("unit_price_minor" >= 0),
 CONSTRAINT "customer_subscriptions_currency_iso3" CHECK ("currency" ~ '^[A-Z]{3}$'), CONSTRAINT "customer_subscriptions_date_order" CHECK ("ends_on" is null or "ends_on" >= "starts_on"),
 CONSTRAINT "customer_subscriptions_recurrence_interval" CHECK ("recurrence_interval" between 1 and 120), CONSTRAINT "customer_subscriptions_billing_day" CHECK ("billing_day" between 1 and 31),
 CONSTRAINT "customer_subscriptions_version_positive" CHECK ("version" > 0)
);
--> statement-breakpoint
ALTER TABLE "customer_service_subscriptions" ADD CONSTRAINT "customer_subscriptions_organization_fk" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE "customer_service_subscriptions" ADD CONSTRAINT "customer_subscriptions_customer_fk" FOREIGN KEY ("organization_id","customer_party_id") REFERENCES "parties"("organization_id","id") ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE "customer_service_subscriptions" ADD CONSTRAINT "customer_subscriptions_plan_fk" FOREIGN KEY ("organization_id","service_plan_id") REFERENCES "service_plans"("organization_id","id") ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE "customer_service_subscriptions" ADD CONSTRAINT "customer_subscriptions_project_fk" FOREIGN KEY ("organization_id","project_id") REFERENCES "projects"("organization_id","id") ON DELETE RESTRICT;
--> statement-breakpoint
CREATE INDEX "customer_subscriptions_filters_idx" ON "customer_service_subscriptions"("organization_id","lifecycle","customer_party_id","service_plan_id");
--> statement-breakpoint
CREATE FUNCTION validate_customer_service_subscription_relationships() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM party_roles r JOIN parties p ON p.organization_id=r.organization_id AND p.id=r.party_id WHERE r.organization_id=NEW.organization_id AND r.party_id=NEW.customer_party_id AND r.role='client' AND p.status='active') THEN RAISE EXCEPTION 'customer must be an active client' USING ERRCODE='23514'; END IF;
 IF NEW.project_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM projects p WHERE p.organization_id=NEW.organization_id AND p.id=NEW.project_id AND p.client_party_id=NEW.customer_party_id) THEN RAISE EXCEPTION 'project customer mismatch' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER customer_service_subscription_relationships BEFORE INSERT OR UPDATE OF customer_party_id,project_id ON customer_service_subscriptions FOR EACH ROW EXECUTE FUNCTION validate_customer_service_subscription_relationships();
