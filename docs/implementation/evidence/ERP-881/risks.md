# ERP-881 risks

- The production figures are a read-only projection from the currently deployed data. Exact live
  rendering requires deployment and readback of the ERP-881 API and web images.
- Legacy rows with a null funding snapshot depend on the reviewed category treatment. New and
  explicitly classified rows remain governed by their immutable funding snapshot.
- Review items explain the difference between the confirmed cash timeline and the full ledger
  balance. They are not silently removed or used to alter dashboard metrics.

