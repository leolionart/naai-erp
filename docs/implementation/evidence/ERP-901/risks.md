# ERP-901 risks

- Additional task-ledger modules remain deferred rather than being implemented with non-atomic
  sequential service calls.
- The canonical audit reason is currently server generated; ERP-902 will formalize optional notes
  and reason policy across routine operations.
- Expanding the resource list requires a same-`PoolClient` adapter and atomic failure coverage; adding
  a resource name to UI or OpenAPI alone is prohibited.
