# ERP-861 production mutations

Target: `https://erp.naai.studio`, organization `naai`.

The following draft expenses were updated through
`PATCH /api/v1/organizations/naai/expenses/{expenseId}` with `If-Match`, a stable idempotency key and
individual correlation ID. Only draft line category/funding metadata changed; lifecycle and money
did not change.

| Expense | Final version | Audit event |
| --- | ---: | --- |
| expense-inferred-payroll-2024-01 | 3 | 7614d3a2-3db6-46c7-9159-40e578091f79 |
| expense-inferred-payroll-2024-02 | 3 | 94f9f623-f648-41bf-9803-3eebd81ee436 |
| expense-inferred-payroll-2024-03 | 3 | ef0d8ca6-b624-42d3-8b5f-432a49aae04b |
| expense-inferred-payroll-2024-04 | 3 | 85d56d34-cc57-4a60-9e4f-aa9f10f3a340 |
| expense-inferred-payroll-2024-05 | 3 | a4da8fb6-7e44-477c-adb1-549934dcba20 |
| expense-inferred-payroll-2024-06 | 3 | a54eb0f0-5757-417b-b3a9-4aa0f22de2c6 |
| expense-inferred-payroll-2024-07 | 3 | 195b7ced-7fbb-471e-a7dd-576d38ea4611 |
| expense-inferred-payroll-2024-08 | 3 | 81f1dabd-7264-4cb4-a85d-ffa5cfbdb5ee |
| expense-inferred-payroll-2024-09 | 3 | 22f04b48-3e6d-4d4e-b534-391cc35b0657 |
| expense-inferred-payroll-2024-10 | 3 | 79910e69-4adc-4a23-8c24-8d58bb51979f |
| expense-inferred-payroll-2024-11 | 3 | 6c68a7fa-f09d-41fe-91ad-b446e2e1b784 |
| expense-inferred-payroll-2024-12 | 3 | 9278f303-71c1-4e54-94c0-31f0c3f31341 |

Readback for every row: `state=draft`, `expenseCategoryCode=SALARY`,
`fundingTreatment=owner_paid_company_cost`.
