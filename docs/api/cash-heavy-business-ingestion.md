# Owner-paid Small Business Ingestion Guide

This project uses a simple default operating model: one owner pays most company costs from the
owner's personal bank account. AI should follow this model unless the owner explicitly says a
transaction used a company-owned bank or cash account.

## Default model

```text
Supplier invoice or business expense
  -> company recognizes expense/asset and any eligible VAT
  -> company credits Owner Payable / Owner Current Account
  -> company may reimburse the owner later
```

The owner's personal bank account is not a company financial account. Do not create it as a
`financial_account`, import its complete statement, or classify unrelated personal transactions.

## Required setup

1. Create one party representing the owner, with the applicable owner/employee/supplier-like role
   required by the configured master-data policy.
2. Configure one reviewed liability account such as “Owner Payable” or “Owner Current Account”. The
   exact account code is organization/accountant configuration; AI must lookup it and never assume a
   code.
3. Keep normal supplier parties, projects, expense accounts, VAT accounts and dimensions unchanged.

The owner party and liability account must belong to the same organization as every linked expense
or invoice.

## Decision table

| Event                                         | Canonical source                                   | Counter-account treatment                                  | Do not do                             |
| --------------------------------------------- | -------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------- |
| Owner pays a supplier invoice for the company | `purchase_invoice`                                 | Credit reviewed Owner Payable instead of company bank/cash | Do not create a duplicate expense     |
| Owner pays a non-invoice company cost         | `expense`                                          | Credit reviewed Owner Payable                              | Do not pretend account `111/112` paid |
| Company reimburses owner                      | Clear Owner Payable against real company bank/cash | Dr Owner Payable, Cr company bank/cash                     | Do not record another expense         |
| Owner permanently contributes money           | Reviewed owner-capital classification              | Equity contribution                                        | Do not record revenue                 |
| Owner lends money to company                  | Reviewed owner-loan classification                 | Liability                                                  | Do not record revenue                 |
| Owner buys something personal                 | No company mutation                                | Personal transaction                                       | Do not create a company expense       |
| Company pays owner's personal cost            | Owner draw/receivable according to reviewed policy | Equity/owner balance                                       | Do not classify as operating expense  |

## Owner current-account operating cycle

The normal operating cycle may move in both directions through one reviewed Owner Current Account.
Each event remains separate so that funding, expense recognition and settlement are not duplicated.

| Event                                                     | Company entry                                                                                 | Canonical source                                      |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Company transfers or withdraws money to the owner         | Dr reviewed Owner Current Account / owner withdrawal; Cr company bank or cash                 | Owner movement; currently manual/clearing workflow    |
| Owner directly pays a supplier invoice                    | Dr expense/asset/eligible VAT through the invoice lifecycle; Cr Owner Payable/current account | `purchase_invoice` linked to supplier and project     |
| Owner directly pays a non-invoice business cost           | Dr expense/asset; Cr Owner Payable/current account                                            | `expense` linked to payee and project when applicable |
| Owner transfers money into the company account            | Dr company bank; Cr reviewed Owner Current Account, owner loan or equity                      | Reviewed owner-funding movement; never revenue        |
| Company pays a large supplier invoice after owner funding | Dr accounts payable; Cr company bank                                                          | Settlement of the original `purchase_invoice`         |
| Company reimburses the owner                              | Dr Owner Payable/current account; Cr company bank                                             | Liability settlement; never a second expense          |

Example: the owner transfers VND 50,000,000 into the company account and the company then pays a
VND 40,000,000 supplier invoice:

```text
Owner -> company bank 50,000,000
  Dr company bank 50,000,000
  Cr reviewed Owner Current Account / owner loan 50,000,000

Company bank -> supplier 40,000,000
  Dr accounts payable 40,000,000
  Cr company bank 40,000,000
```

The first movement is financing, not revenue. The second movement settles the invoice; it does not
recognize the cost again. Likewise, when the company sends VND 20,000,000 to the owner:

```text
Dr reviewed Owner Current Account / owner withdrawal 20,000,000
Cr company bank 20,000,000
```

That transfer is not an operating expense. AI must resolve whether balances are legally/accountingly
classified as owner payable, owner receivable, owner loan, equity contribution or withdrawal from
the organization's reviewed policy. It must never guess an account code or import the owner's
personal bank account as a company account.

## Output invoice

Sales/output invoices remain unchanged:

1. `partyId` is the customer.
2. `dimensions.projectId` is the stable project ID.
3. For a sales invoice, every linked project must have `client_party_id` equal to the invoice
   customer.
4. Issue/post the invoice through its normal lifecycle.
5. If the customer pays into the owner's personal account, do not import that personal account as a
   company bank account. Record the collection only through an approved owner-custody/clearing
   treatment; if that treatment has not been configured, stop for review.

## Input invoice paid by owner

The invoice still belongs to the supplier and project, not to the owner:

```text
purchase_invoice.partyId = supplier party
purchase_invoice dimensions.projectId = project receiving the cost
payment/funding source = owner party via Owner Payable account
```

Example invoice body:

```json
{
  "type": "purchase_invoice",
  "partyId": "party-supplier-1",
  "documentNumber": "SUP-2026-018",
  "series": "SUP",
  "fiscalYear": 2026,
  "documentDate": "2026-08-07",
  "dueDate": "2026-08-20",
  "currency": "VND",
  "netMinor": "2000000",
  "taxMinor": "200000",
  "grossMinor": "2200000",
  "controlAccountCode": "331",
  "lines": [
    {
      "description": "Dịch vụ phục vụ dự án",
      "quantity": "1",
      "unitPriceMinor": "2000000",
      "netMinor": "2000000",
      "taxMinor": "200000",
      "grossMinor": "2200000",
      "primaryAccountCode": "642",
      "taxAccountCode": "1331",
      "taxCode": "VAT10",
      "dimensions": { "projectId": "project-customer-work-1" },
      "allocations": [
        {
          "id": "purchase-allocation-1",
          "amountMinor": "2000000",
          "dimensions": { "projectId": "project-customer-work-1" }
        }
      ]
    }
  ],
  "externalReference": {
    "system": "paperless",
    "externalId": "supplier-document-018"
  }
}
```

The current purchase-invoice API posts through its configured AP/control accounts. It does not yet
have a first-class “paid by owner” allocation field. Therefore AI must not silently mark the invoice
paid or invent a personal-bank transaction. Use the reviewed Owner Payable clearing workflow when
available; otherwise stop and report the capability gap.

## Non-invoice expense paid by owner

Use the expense API only when the cost is not already represented by a purchase invoice.

```json
{
  "expenseClass": "receipt_backed",
  "payeePartyId": "party-payee-1",
  "expenseDate": "2026-08-07",
  "businessPurpose": "Chi phí vận hành do chủ doanh nghiệp thanh toán",
  "currency": "VND",
  "netMinor": "500000",
  "vatMinor": "0",
  "grossMinor": "500000",
  "counterAccountCode": "OWNER-PAYABLE-CONFIGURED-CODE",
  "evidenceChecklist": {
    "receipt": true,
    "payment": true,
    "businessPurpose": true
  },
  "lines": [
    {
      "description": "Vật tư văn phòng",
      "netMinor": "500000",
      "vatMinor": "0",
      "grossMinor": "500000",
      "postingAccountCode": "642",
      "dimensions": {
        "projectId": "project-stable-id-if-applicable"
      },
      "allocations": [
        {
          "id": "expense-allocation-1",
          "amountMinor": "500000",
          "dimensions": {
            "projectId": "project-stable-id-if-applicable"
          }
        }
      ]
    }
  ]
}
```

`OWNER-PAYABLE-CONFIGURED-CODE` is deliberately a placeholder. AI must resolve the organization's
approved account and must not submit the placeholder itself.

## Reimbursing the owner

Reimbursement is a settlement of the owner liability, not a second expense:

```text
Dr Owner Payable / Owner Current Account
Cr company bank or company cash
```

The system currently has no dedicated owner-reimbursement REST/CLI action. Until one exists, AI must
stop for an approved manual-journal workflow rather than reconciling the payment directly to the
original expense and risking duplicate expense recognition.

## Customer money received in the owner's account

This is not automatically company-bank receipt and not automatically owner income. It creates a
custody/clearing question:

- link the receipt to the exact customer invoice;
- record that the owner holds money on behalf of the company through an approved owner-clearing
  account;
- when the owner transfers the money to the company, clear that balance rather than recognizing
  revenue again.

Because there is no canonical owner-custody receipt API today, AI must stop for review unless the
organization has an explicitly configured clearing workflow.

## Minimal AI workflow

For each owner-paid item:

1. Decide whether it is a purchase invoice, non-invoice business expense or personal transaction.
2. Resolve supplier/payee, project, accounts, tax and dimensions.
3. Verify the business purpose and evidence.
4. Use supplier `partyId` or expense `payeePartyId`; do not replace them with the owner.
5. Use the reviewed Owner Payable account as funding/counter-account where the API permits it.
6. Post through the normal invoice/expense lifecycle.
7. Retain the owner liability balance for later reimbursement.
8. Do not import the owner's complete personal statement.

## Stop conditions

Stop without mutation when:

- the payment may be personal rather than business;
- owner capital contribution versus owner loan is undecided;
- no reviewed Owner Payable/current-account code exists;
- customer money received personally has no approved custody/clearing workflow;
- reimbursement would bypass or duplicate the original expense/invoice;
- supplier, project, tax eligibility or business purpose is ambiguous.

Advanced petty-cash, accountable-advance, physical cash-count and multi-custodian workflows are not
part of this default model.
