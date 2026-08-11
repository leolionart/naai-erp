CREATE TABLE "owner_cash_withdrawals" (
	"organization_id" text NOT NULL,
	"id" text NOT NULL,
	"bank_transaction_id" text NOT NULL,
	"journal_id" text NOT NULL,
	"movement_type" text DEFAULT 'owner_personal_withdrawal' NOT NULL,
	"reason" text NOT NULL,
	"created_by" text NOT NULL,
	"correlation_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "owner_cash_withdrawals_organization_id_id_pk" PRIMARY KEY("organization_id","id"),
	CONSTRAINT "owner_cash_withdrawals_transaction_unique" UNIQUE("organization_id","bank_transaction_id"),
	CONSTRAINT "owner_cash_withdrawals_journal_unique" UNIQUE("organization_id","journal_id"),
	CONSTRAINT "owner_cash_withdrawals_movement_type" CHECK ("owner_cash_withdrawals"."movement_type" = 'owner_personal_withdrawal'),
	CONSTRAINT "owner_cash_withdrawals_reason" CHECK (btrim("owner_cash_withdrawals"."reason") <> '')
);
--> statement-breakpoint
ALTER TABLE "owner_cash_withdrawals" ADD CONSTRAINT "owner_cash_withdrawals_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "owner_cash_withdrawals" ADD CONSTRAINT "owner_cash_withdrawals_transaction_fk" FOREIGN KEY ("organization_id","bank_transaction_id") REFERENCES "public"."bank_transactions"("organization_id","id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "owner_cash_withdrawals" ADD CONSTRAINT "owner_cash_withdrawals_journal_fk" FOREIGN KEY ("organization_id","journal_id") REFERENCES "public"."journal_entries"("organization_id","id") ON DELETE restrict ON UPDATE no action;
