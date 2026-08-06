# ERP-710 Summary

Implemented organization-scoped external references for commercial documents and expenses, Paperless-aware idempotent webhook upsert, `credit_note.create`, and cross-model supplier-invoice duplicate prevention.

The implementation preserves existing accounting lifecycle rules and uses forward migration `0032_ambiguous_grey_gargoyle.sql`.
