# ERP-640 risks and follow-up

- Account root types do not identify contributed capital, retained earnings, restricted cash or reviewed equity adjustments; explicit approved semantic mappings are required.
- Owner loans must never inflate contributed capital or operating inflow.
- Runway must use reviewed operating burn and unrestricted cash; financing inflows and restricted balances remain disclosed but excluded.
- Negative revenue can occur after credit notes. Profitability and ROS use a signed nonzero denominator; ROI/ROE/ROA and Equity Consumed require a positive reviewed denominator.
- ROI objects and included-cost policies must remain purpose-specific and versioned; a combined ROI would be misleading.
- Calculated outputs remain read-time reports in ERP-640. Reproducible persisted snapshots belong to ERP-650.
- Local and exact-commit proof is green. All database/API/worker integration, source-boundary controls and 51/51 Playwright journeys passed for `b23d70bb8fdb4b27123cb41e1bea8e5830f9a9f2` at https://github.com/leolionart/naai-erp/actions/runs/31069121747; no ERP-640 acceptance boundary remains open.
