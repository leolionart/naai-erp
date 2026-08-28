# ERP-950 Business category migration repair

Added an idempotent repair migration that recreates the unified `business_categories` enum/table,
index and default revenue/expense catalog when a deployment previously marked the original
migration as applied but the relation is missing.
