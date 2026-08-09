# ERP-871 Summary

Added a read-only Owner Current reconciliation menu at `/banking/owner-current`. The API resolves the approved TT133 `owner_current` mapping and returns every posted/reversed journal movement with exact signed owner-liability and company-funds effects, running balance and journal drill-down.

Local readback currently reports VND 352,758,650 increase, VND 0 decrease and VND 352,758,650 closing Owner Current balance. The UI explicitly warns that recorded payments/withdrawals are missing instead of fabricating them from descriptions.
