ALTER TABLE "accounting_workflow_policies" DROP CONSTRAINT "workflow_policy_operating_mode";
--> statement-breakpoint
UPDATE "accounting_workflow_policies"
SET "operating_mode" = 'solopreneur', "updated_at" = now()
WHERE "operating_mode" = 'owner_final';
--> statement-breakpoint
ALTER TABLE "accounting_workflow_policies" ADD CONSTRAINT "workflow_policy_operating_mode" CHECK ("operating_mode" in ('controlled', 'solopreneur'));
