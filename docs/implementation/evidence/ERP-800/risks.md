# ERP-800 Risks

- Review data is evidence and proposed mapping, not posted accounting truth.
- Posted invoices and expenses remain immutable; financial correction requires reversal and replacement in a later controlled workflow.
- Generic identities must not be interpreted as verified clients or suppliers.
- Owner/personal movements and zero-value rows must not create journals until explicitly classified and approved.
- Import retry preserves user corrections once resolution or notes exist; source refresh may update untouched staged proposals only.
- Live-data correction audit on 2026-08-06 found no canonical promote/apply command: review-row PATCH updates staging JSON only, while the legacy commit path directly created posted journals.
- Four owner/personal movements require an owner/accountant classification (capital contribution, withdrawal, owner loan or internal transfer) before any journal may be created.
- 159 expense rows have no source payee identity. Personnel, expense type and notes can support proposals, but they do not prove the legal supplier/payee for tax or AP purposes.
- Source `cash`, `received` and `fundingSource` fields do not by themselves define the canonical payment allocation or counter-account. Applying a guessed interpretation would change cash, AR/AP and tax reports.
- Existing import-created posted records must not be edited in place. Any financial remapping requires controlled reversal/replacement with exact reconciliation evidence.
