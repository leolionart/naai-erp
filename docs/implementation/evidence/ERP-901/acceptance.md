# ERP-901 acceptance

- Persisted solopreneur policy and owner role are required.
- Capability and expected resource version come from the server.
- Draft submit+approve occurs in one transaction; failure rolls back both transitions.
- Controlled mode denial, idempotent replay and no journal/post effect are covered.
- Runtime scope is explicitly limited to timesheet, time adjustment and direct-cost allocation.
- Owner and controlled-mode rendered journeys passed `2/2`; full repository quality passed.
