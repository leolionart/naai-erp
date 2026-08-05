# ERP-420 risks and follow-ups

- Cross-currency legs must not be auto-paired by inferring an exchange rate. They remain review exceptions until an explicit FX policy is supplied.
- Bank fees must be explicit; unequal principal amounts cannot be silently classified as fees.
- A one-sided leg leaves a visible transfer-transit balance until the counterpart arrives or an authorized correction is posted.
- Internal transfers remain separate from commercial-document reconciliation so revenue, expense, AR and AP semantics are not polluted.
