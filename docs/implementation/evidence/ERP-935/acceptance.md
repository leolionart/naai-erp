# ERP-935 acceptance

- Root category projection is canonical when present.
- If a compatibility response omits the root projection, the UI reads category from line fields,
  line dimensions, or allocation dimensions without using account codes or form defaults.
- The localhost-shaped record with `category: null`, `lines[0].dimensions: {}`, and
  `lines[0].allocations[0].dimensions.category: VEHICLE_RENTAL` now renders
  `Chi phí Thuê xe / Thuê pin sạc` in the list and initializes the same category in detail.
- API list and detail SQL use the same category projection logic, including allocation dimensions.
- Accounting totals, journals, lifecycle state and existing source data remain unchanged.
