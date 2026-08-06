# GF-FORECAST-002

Independent exact-VND oracle for ERP-610 revenue, expense and cash forecast composition.

The fixture proves:

- selected-basis actual-to-date remains separate from forecast inputs;
- committed milestones, scheduled recurring revenue and weighted pipeline compose revenue once;
- reviewed manual adjustments are signed explicitly;
- payroll/OPEX composition is distinct from cash timing;
- opening cash, expected collections, financing and cash outflows produce projected closing cash;
- the same commercial root/date cannot be counted twice as different source representations;
- owner funding is financing and never revenue or operating collection.

Files:

- `input.json`: anonymized reviewed source facts and negative controls.
- `expected-components.csv`: exact signed/weighted amount for each included component.
- `expected-composition.csv`: independently reviewed formula totals.
- `expected-control-tie.csv`: exact totals and compliance controls.
- `oracle-manual.md`: human-readable arithmetic and classification review.
- `verify.mjs`: fixture-local verifier that does not import production code.
- `SHA256SUMS`: immutable content manifest.

Any output change requires explicit review and a documented reason.
