# ERP-640 risks and follow-up

- Account root types do not identify contributed capital, retained earnings, restricted cash or reviewed equity adjustments; explicit approved semantic mappings are required.
- Owner loans must never inflate contributed capital or operating inflow.
- Runway must use reviewed operating burn and unrestricted cash; financing inflows and restricted balances remain disclosed but excluded.
- Negative revenue can occur after credit notes. Profitability and ROS use a signed nonzero denominator; ROI/ROE/ROA and Equity Consumed require a positive reviewed denominator.
- ROI objects and included-cost policies must remain purpose-specific and versioned; a combined ROI would be misleading.
- Calculated outputs remain read-time reports in ERP-640. Reproducible persisted snapshots belong to ERP-650.
- Targeted PostgreSQL 16 integration is green locally. The complete shared database/API/worker suite remains CI-authoritative until the exact implementation commit passes.
