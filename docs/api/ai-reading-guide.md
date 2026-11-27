# AI reading guide: bounded reads

Every list read is bounded by the server (BR-READ-001..006). Never download a whole table to answer a question.

## Workflow

1. **Count or summarize first.** `GET /expenses/count?state=posted` or `GET /expenses/summary?groupBy=month|state|class|payee|category` (max 120 groups) answer most statistical questions without records.
2. **Filter, then take the first page.** Use `state`, `startsOn`, `endsOn`, `payeePartyId`, `fundingTreatment`; add `view=summary` on lists that embed lines (`commercial-documents`, `journals`).
3. **Fetch details by id.** `GET /expenses/{id}`, `GET /commercial-documents/{id}`, `GET /journals/{id}`.
4. **Large exports go to a file.** `naai-erp expenses list --all --output /tmp/expenses.ndjson` (NDJSON, or `--format csv`); only `{ file, records, bytes, nextCursor? }` is printed. Never use `--all` without `--output`.

## Contract

| Item | Behavior |
| --- | --- |
| `limit` | default 50, clamped to 200 (25 for `view=full`); clamping sets `meta.limitClamped`; non-numeric returns `400 LIMIT_INVALID` |
| `cursor` | opaque keyset cursor from `data.nextCursor`; invalid returns `400 CURSOR_INVALID` |
| `includeTotal=true` | adds `data.total` (one extra count query, avoid in hot paths) |
| response | `data: { items, hasMore, limit, nextCursor?, total? }`, `meta: { count, bytes, truncated, limitClamped, hint? }` |
| size budget | pages are cut at a record boundary at 256 KB (`API_MAX_LIST_RESPONSE_BYTES`, minimum 32 KB); `meta.truncated=true` and `nextCursor` point to the next record |
| order | `expenses`: `expenseDate desc, id`; `commercial-documents`: `documentDate desc, id`; `journals`: `journalDate desc, id` |

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

## Rollout status

CLI: `naai-erp expenses count --data '{"state":"draft"}'`, `naai-erp expenses summary --group-by month`, `naai-erp discovery describe --key expenses` (few KB, instead of the OpenAPI) and `naai-erp discovery openapi --tag expenses`. Bounded today: `expenses` (+`count`, `summary`), `commercial-documents`, `journals`. The rest of the routes are tracked in `docs/api/list-endpoint-inventory.md` (regenerate with `node scripts/list-endpoint-inventory.mjs`).
