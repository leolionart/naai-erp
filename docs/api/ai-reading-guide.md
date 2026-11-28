# AI reading guide: bounded reads

Every list read is bounded by the server (BR-READ-001..006). Never download a whole table to answer a question.

## Workflow

1. **Count or summarize first.** `GET /expenses/count?state=posted` or `GET /expenses/summary?groupBy=month|state|class|payee|category` (max 120 groups) answer most statistical questions without records.
2. **Filter, then take the first page.** Use `state`, `startsOn`, `endsOn`, `payeePartyId`, `fundingTreatment`; add `view=summary` on lists that embed lines (`commercial-documents`, `journals`).
3. **Fetch details by id.** `GET /expenses/{id}`, `GET /commercial-documents/{id}`, `GET /journals/{id}`.
4. **Large exports go to a file.** `naai-erp expenses list --all --output /tmp/expenses.ndjson` (NDJSON, or `--format csv`); only `{ file, records, bytes, nextCursor? }` is printed. Never use `--all` without `--output`.

## Contract

| Item                | Behavior                                                                                                                                                     |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `limit`             | default 50, clamped to 200 (25 for `view=full`); clamping sets `meta.limitClamped`; non-numeric returns `400 LIMIT_INVALID`                                  |
| `cursor`            | opaque keyset cursor from `data.nextCursor`; invalid returns `400 CURSOR_INVALID`                                                                            |
| `includeTotal=true` | adds `data.total` (one extra count query, avoid in hot paths)                                                                                                |
| response            | `data: { items, hasMore, limit, nextCursor?, total? }`, `meta: { count, bytes, truncated, limitClamped, hint? }`                                             |
| size budget         | pages are cut at a record boundary at 256 KB (`API_MAX_LIST_RESPONSE_BYTES`, minimum 32 KB); `meta.truncated=true` and `nextCursor` point to the next record |
| order               | `expenses`: `expenseDate desc, id`; `commercial-documents`: `documentDate desc, id`; `journals`: `journalDate desc, id`                                      |

`journals` and `commercial-documents` still embed `lines` by default for backward compatibility; pass `view=summary` to drop them.

## Examples

```bash
# How much did we spend per month this year?
curl -H "Authorization: Bearer $TOKEN" "$API/organizations/$ORG/expenses/summary?groupBy=month&startsOn=2026-01-01"
# Unpaid draft count
curl -H "Authorization: Bearer $TOKEN" "$API/organizations/$ORG/expenses/count?state=draft"
# First 20 expenses of a supplier, then follow the cursor
naai-erp expenses list --limit 20 --data '{"payeePartyId":"SUP-01"}'
naai-erp expenses list --limit 20 --cursor "<data.nextCursor>"
```

## CLI output budget

stdout is limited to `--max-bytes` (default 200000, or `NAAI_ERP_MAX_BYTES`). Larger results are cut on a record boundary, stay valid JSON, set `meta.truncated`, and print a hint on stderr. `--human` pretty-prints.

## Nothing is cut silently

Every organization-scoped collection GET declares its paging: `page: { limit, hasMore, nextCursor?, total? }`, `data.hasMore`/`data.nextCursor`
(item-shaped lists) and `meta: { count, bytes, truncated, limitClamped }`. If `hasMore` is true, more records exist: follow `nextCursor`
or narrow the filter. The web client follows `nextCursor` automatically and sets `meta.truncated` if it stops at its 50-page cap; the CLI prints the
`page` block and, past `--max-bytes`, a stderr hint. Routes without SQL pagination are paged by a server safety net (default 50, max 200); see the inventory.

## Rollout status

CLI: `naai-erp expenses count --data '{"state":"draft"}'`, `naai-erp expenses summary --group-by month`, `naai-erp discovery describe --key expenses` (few KB, instead of the OpenAPI) and `naai-erp discovery openapi --tag expenses`. Every collection route is bounded (SQL keyset with `q`/`sort`/`includeTotal` for `expenses`, `commercial-documents`, `journals`, `banking/transactions`, `banking/imports`, `banking/reconciliations` and `customer-receipts`; safety net for the rest). See `docs/api/list-endpoint-inventory.md` (regenerate with `node scripts/list-endpoint-inventory.mjs`).
