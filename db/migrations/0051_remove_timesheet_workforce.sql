-- ERP-905 intentionally removes obsolete time, cost-allocation and overhead-allocation read models.
-- Canonical expenses, commercial documents and posted journals are deliberately untouched.
DROP TABLE IF EXISTS overhead_allocation_splits;
--> statement-breakpoint
DROP TABLE IF EXISTS overhead_allocation_runs;
--> statement-breakpoint
DROP TABLE IF EXISTS overhead_source_pool_items;
--> statement-breakpoint
DROP TABLE IF EXISTS overhead_source_pools;
--> statement-breakpoint
DROP TABLE IF EXISTS overhead_allocation_policies;
--> statement-breakpoint
DROP TABLE IF EXISTS direct_cost_allocation_splits;
--> statement-breakpoint
DROP TABLE IF EXISTS direct_cost_allocations;
--> statement-breakpoint
DROP TABLE IF EXISTS project_cost_items;
--> statement-breakpoint
DROP TABLE IF EXISTS timesheet_adjustments;
--> statement-breakpoint
DROP TABLE IF EXISTS timesheet_cost_snapshots;
--> statement-breakpoint
DROP TABLE IF EXISTS timesheet_entries;
--> statement-breakpoint
DROP TABLE IF EXISTS timesheets;
--> statement-breakpoint
DROP TABLE IF EXISTS labor_cost_rates;
--> statement-breakpoint
DROP TABLE IF EXISTS workforce_capacity_versions;
--> statement-breakpoint
DROP TABLE IF EXISTS workforce_profiles;
--> statement-breakpoint
DROP TYPE IF EXISTS overhead_run_state;
--> statement-breakpoint
DROP TYPE IF EXISTS overhead_pool_state;
--> statement-breakpoint
DROP TYPE IF EXISTS overhead_policy_state;
--> statement-breakpoint
DROP TYPE IF EXISTS overhead_cost_class;
--> statement-breakpoint
DROP TYPE IF EXISTS overhead_allocation_method;
--> statement-breakpoint
DROP TYPE IF EXISTS direct_cost_allocation_state;
--> statement-breakpoint
DROP TYPE IF EXISTS project_cost_basis;
--> statement-breakpoint
DROP TYPE IF EXISTS project_cost_class;
--> statement-breakpoint
DROP TYPE IF EXISTS project_cost_source_type;
--> statement-breakpoint
DROP TYPE IF EXISTS timesheet_adjustment_state;
--> statement-breakpoint
DROP TYPE IF EXISTS labor_cost_basis;
--> statement-breakpoint
DROP TYPE IF EXISTS labor_cost_rate_state;
--> statement-breakpoint
DROP TYPE IF EXISTS time_entry_scope;
--> statement-breakpoint
DROP TYPE IF EXISTS time_entry_mode;
--> statement-breakpoint
DROP TYPE IF EXISTS timesheet_state;
--> statement-breakpoint
DROP TYPE IF EXISTS workforce_kind;
