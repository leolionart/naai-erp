# ERP-936 summary

The reported localhost row `00267579` was inspected against the live production-backed API. Its list
response had `category: null` and omitted allocation children; its detail response stored the canonical
`VEHICLE_RENTAL` only in `lines[].allocations[].dimensions.category`.

The list loader now hydrates only category-empty commercial-document rows from their canonical detail
endpoint. The shared adapter reads the allocation category, so the row renders `Chi phí Thuê xe /
Thuê pin sạc` without guessing from the description or account code.

The API store projection was also hardened to read allocation category dimensions for direct list/detail
API consumers. The homepage expense overview now hydrates missing list categories through canonical
detail endpoints and splits allocation-only legacy rows by allocation amount, so category labels and
totals match the source record detail.

The migration preserves posted-ledger immutability while allowing the existing audited metadata and tax
finalization corrections. No financial data was mutated and no production deployment was performed.
