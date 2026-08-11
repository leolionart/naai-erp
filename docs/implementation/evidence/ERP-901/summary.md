# ERP-901 summary

Implemented one centralized atomic routine-completion capability for the safe initial slice:
timesheet, time adjustment and direct-cost allocation. It uses resource adapters sharing the same
PostgreSQL transaction. Controlled mode and non-owner behavior remain unchanged. The command stops
at approved and never posts, reverses, locks or bills.

Budget, scope, planning, forecast and recognition resources are deferred until their stores expose
equivalent same-client transaction adapters; the runtime contract does not advertise them.

The final runtime/API/CLI/OpenAPI capability list contains exactly the three supported resource
types. Server-provided global and per-record capabilities prevent the UI from inferring eligibility.
