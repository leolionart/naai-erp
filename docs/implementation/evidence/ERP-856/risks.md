# ERP-856 risks

- The screen manages the default catalog classification; purchase invoice forms do not yet provide a
  product selector or automatically calculate tax from the selected product.
- The production-backed local proxy cannot serve this resource until the new API/migration is
  deployed. Local development temporarily routes only this workspace to `http://localhost:3001`.
