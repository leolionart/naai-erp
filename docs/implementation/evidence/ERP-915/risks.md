# ERP-915 risks

- An invalid or expired login cookie still returns a session error toast; reopening the dialog retries
  after the user refreshes or signs in again.
- The production token remains present only in the rendered client example after the authenticated
  user opens the dialog. It is not persisted by this component.
