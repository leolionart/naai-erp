# ERP-920 risks

Quick ingestion intentionally rejects ambiguous matches rather than guessing. The API credential is
revealed only to an authenticated session and must be stored by the integrator in a secret manager,
never in workflow logs or source control.
