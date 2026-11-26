# ERP-975

Reported: changing an expense's payment source to the company cash held by the owner showed `VALIDATION_FAILED` under "Không thể tải dữ liệu".

Root causes: the quick view assembled the replacement expense in the browser from the raw API record (allocations arrive as database rows, so ids and amounts were missing and the API rejected them), it could not select the owner-held custody cash fund (it shares ledger account 111 with company cash and the options were de-duplicated by ledger code), and action errors reused the load-error title.

Changes: server-side `POST /expenses/{id}/reclassify-funding` (financialAccountId or counterAccountCode), UI offers each financial account and sends only the target, CLI routing, clearer alert title. Also fixed: migration 0072 lets unreconcile move a paid/partially paid document back (FINAL_DOCUMENT_IMMUTABLE), banking owner-current read model resolves legacy dimension categories like the dashboard, webhook integration test fixtures.
