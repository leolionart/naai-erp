# Gate G3 Summary

Gate G3 covers document/expense posting, evidence integrity/access, inbound webhook controls, outbound delivery and the operational admin UI.

The original payment drill-down criterion was circular because ERP-400/410 were blocked by G3. The coding plan now keeps source → journal → authorized evidence in G3 and verifies payment allocation/reconciliation drill-down in G4, where the payment and bank models are implemented.
