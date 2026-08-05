CREATE TYPE "public"."bank_control_exception_kind" AS ENUM('suspense', 'control');--> statement-breakpoint
CREATE TYPE "public"."bank_control_exception_status" AS ENUM('pending', 'approved', 'resolved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."bank_statement_session_state" AS ENUM('draft', 'reviewed', 'closed');--> statement-breakpoint
CREATE TABLE "bank_control_exceptions" (
	"organization_id" text NOT NULL,
	"id" text NOT NULL,
	"session_id" text NOT NULL,
	"bank_transaction_id" text,
	"kind" "bank_control_exception_kind" NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" text NOT NULL,
	"owner_id" text NOT NULL,
	"reason" text NOT NULL,
	"review_due" date NOT NULL,
	"status" "bank_control_exception_status" DEFAULT 'pending' NOT NULL,
	"version" bigint DEFAULT 1 NOT NULL,
	"created_by" text NOT NULL,
	"approved_by" text,
	"approved_at" timestamp with time zone,
	"approval_reason" text,
	"resolved_by" text,
	"resolved_at" timestamp with time zone,
	"resolution_reference" text,
	"resolution_reason" text,
	"rejected_by" text,
	"rejected_at" timestamp with time zone,
	"rejection_reason" text,
	"correlation_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bank_control_exceptions_organization_id_id_pk" PRIMARY KEY("organization_id","id"),
	CONSTRAINT "bank_control_exception_amount" CHECK ("bank_control_exceptions"."amount_minor" <> 0),
	CONSTRAINT "bank_control_exception_currency" CHECK ("bank_control_exceptions"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "bank_control_exception_owner" CHECK (btrim("bank_control_exceptions"."owner_id") <> ''),
	CONSTRAINT "bank_control_exception_reason" CHECK (btrim("bank_control_exceptions"."reason") <> ''),
	CONSTRAINT "bank_control_exception_version" CHECK ("bank_control_exceptions"."version" > 0),
	CONSTRAINT "bank_control_exception_approval" CHECK ("bank_control_exceptions"."status" <> 'approved' or ("bank_control_exceptions"."approved_by" is not null and "bank_control_exceptions"."approved_at" is not null and "bank_control_exceptions"."approval_reason" is not null and btrim("bank_control_exceptions"."approval_reason") <> '')),
	CONSTRAINT "bank_control_exception_resolution" CHECK ("bank_control_exceptions"."status" <> 'resolved' or ("bank_control_exceptions"."resolved_by" is not null and "bank_control_exceptions"."resolved_at" is not null and "bank_control_exceptions"."resolution_reference" is not null and btrim("bank_control_exceptions"."resolution_reference") <> '' and "bank_control_exceptions"."resolution_reason" is not null and btrim("bank_control_exceptions"."resolution_reason") <> '')),
	CONSTRAINT "bank_control_exception_rejection" CHECK ("bank_control_exceptions"."status" <> 'rejected' or ("bank_control_exceptions"."rejected_by" is not null and "bank_control_exceptions"."rejected_at" is not null and "bank_control_exceptions"."rejection_reason" is not null and btrim("bank_control_exceptions"."rejection_reason") <> ''))
);
--> statement-breakpoint
CREATE TABLE "bank_statement_session_imports" (
	"organization_id" text NOT NULL,
	"session_id" text NOT NULL,
	"import_id" text NOT NULL,
	"linked_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bank_statement_session_imports_organization_id_session_id_import_id_pk" PRIMARY KEY("organization_id","session_id","import_id"),
	CONSTRAINT "bank_statement_session_import_once" UNIQUE("organization_id","import_id")
);
--> statement-breakpoint
CREATE TABLE "bank_statement_sessions" (
	"organization_id" text NOT NULL,
	"id" text NOT NULL,
	"financial_account_id" text NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"opening_balance_minor" bigint NOT NULL,
	"closing_balance_minor" bigint NOT NULL,
	"currency" text NOT NULL,
	"state" "bank_statement_session_state" DEFAULT 'draft' NOT NULL,
	"version" bigint DEFAULT 1 NOT NULL,
	"created_by" text NOT NULL,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone,
	"review_reason" text,
	"closed_by" text,
	"closed_at" timestamp with time zone,
	"close_reason" text,
	"correlation_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bank_statement_sessions_organization_id_id_pk" PRIMARY KEY("organization_id","id"),
	CONSTRAINT "bank_statement_session_period_unique" UNIQUE("organization_id","financial_account_id","period_start","period_end"),
	CONSTRAINT "bank_statement_session_period" CHECK ("bank_statement_sessions"."period_end" >= "bank_statement_sessions"."period_start"),
	CONSTRAINT "bank_statement_session_currency" CHECK ("bank_statement_sessions"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "bank_statement_session_version" CHECK ("bank_statement_sessions"."version" > 0),
	CONSTRAINT "bank_statement_session_close_metadata" CHECK ("bank_statement_sessions"."state" <> 'closed' or ("bank_statement_sessions"."closed_by" is not null and "bank_statement_sessions"."closed_at" is not null and "bank_statement_sessions"."close_reason" is not null and btrim("bank_statement_sessions"."close_reason") <> ''))
);
--> statement-breakpoint
ALTER TABLE "bank_control_exceptions" ADD CONSTRAINT "bank_control_exceptions_session_fk" FOREIGN KEY ("organization_id","session_id") REFERENCES "public"."bank_statement_sessions"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_control_exceptions" ADD CONSTRAINT "bank_control_exceptions_transaction_fk" FOREIGN KEY ("organization_id","bank_transaction_id") REFERENCES "public"."bank_transactions"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_statement_session_imports" ADD CONSTRAINT "bank_statement_session_imports_session_fk" FOREIGN KEY ("organization_id","session_id") REFERENCES "public"."bank_statement_sessions"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_statement_session_imports" ADD CONSTRAINT "bank_statement_session_imports_import_fk" FOREIGN KEY ("organization_id","import_id") REFERENCES "public"."bank_statement_imports"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_statement_sessions" ADD CONSTRAINT "bank_statement_sessions_account_fk" FOREIGN KEY ("organization_id","financial_account_id") REFERENCES "public"."financial_accounts"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bank_control_exceptions_session_status_idx" ON "bank_control_exceptions" USING btree ("organization_id","session_id","status");--> statement-breakpoint
CREATE INDEX "bank_statement_sessions_account_period_idx" ON "bank_statement_sessions" USING btree ("organization_id","financial_account_id","period_start","period_end");