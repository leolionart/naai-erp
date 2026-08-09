# ERP-871 Risks

- The local snapshot contains no Owner Current debit journals, while historical evidence says repayment journals previously existed. The new screen exposes this gap but does not recreate accounting history.
- Existing journal metadata cannot always distinguish reimbursement, owner withdrawal, loan settlement and equity movement; the read model therefore uses a conservative `company_payment_to_owner` label.
- Browser plugin was unavailable; rendered verification used the repository Playwright suite.
