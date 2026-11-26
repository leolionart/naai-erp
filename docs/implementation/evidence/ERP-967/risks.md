# Remaining risks

- Auto-migrating on boot applies forward migrations without the maintenance stop of the update script; migrations must stay additive (repo policy).
- 10 unrelated integration tests fail (commercial-documents x4, expenses, aging, banking, reconciliation, exports x2, inbound webhook, restore); not yet triaged.
