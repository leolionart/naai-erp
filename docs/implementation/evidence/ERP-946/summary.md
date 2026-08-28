# ERP-946 evidence — unified funding contract defaults

Purchase-invoice API and quick-ingestion paths now default omitted funding to `owner_paid`.
At persistence/posting time the store resolves the approved TT133 `owner_current` mapping for the
document date. Explicit `company_bank` funding remains mapped to the selected active financial
account; the legacy `fundingSource` alias remains accepted.
