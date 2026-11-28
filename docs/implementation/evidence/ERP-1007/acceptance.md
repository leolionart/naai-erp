# ERP-1007 acceptance

- Default page size (50), limit clamping, deterministic keyset cursor walks across >100 rows per table without duplicates or gaps, `q` search, `sort=date_asc|date_desc`, `includeTotal`, and HTTP 400 on invalid `sort`/`limit`/`cursor` verified for all five converted routes.
- OpenAPI parameters (`Limit`, `Cursor`, `IncludeTotal`, `Q`, `Sort`, `x-naai-list: true`) and `docs/api/list-endpoint-inventory.md` updated and verified.
