# ERP-420 acceptance evidence

## BR-BNK-003 — Internal transfer does not create revenue or expense

Pass. `GF-TRANSFER-001` independently verifies balanced outgoing/incoming journals, zero final transit balance and zero principal P&L impact, with only an explicit bank fee posted to expense. Domain invariants restrict principal lines to bank/transit accounts and reject hidden fees or inferred FX.

## Controlled match and unmatch

Implemented. Source, destination and optional fee legs are locked in deterministic order and protected by relational claims. Every create, match and unmatch appends a new attempt/event. Unmatch requires a reason and expected resource version, reverses principal and separate-fee journals, releases claims and resets all bank legs to review state.

## UI workflow pattern

Pass. The module queue is `/banking/internal-transfers`; multi-step review is `/banking/internal-transfers/{transferId}`; bounded create/pairing actions use Dialogs; contextual filters/candidates use Sheets; destructive unmatch uses a reasoned AlertDialog. Desktop and mobile Playwright coverage passes without horizontal overflow.

No AI/copilot/chat affordance or AI branding is displayed. Machine interaction is provided headlessly through `/api/v1/openapi.json`, `/api/v1/capabilities`, exact request/response schemas and CLI discovery/lifecycle commands.
