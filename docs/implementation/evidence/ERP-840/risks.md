# ERP-840 Risks

- User/credential administration has no API. The script's optional local bootstrap writes only the
  synthetic checker user, membership, roles and hashed credential to authentication tables.
- PostgreSQL DATE decoding in the current forecast-component runtime shifts the forecast as-of date
  under the `Asia/Ho_Chi_Minh` process timezone. The demo uses the API-observed date and records this
  workaround in the script; the runtime codec should be fixed separately.
- Project profitability is populated from project-attributed invoice/cost data but does not exercise
  every advanced workforce, overhead and recognition sub-feature.
- The demo is synthetic local data and must never be executed against staging or production.
