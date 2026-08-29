# Risks and follow-ups

- Existing web test failures are unrelated to this change and must be repaired separately.
- The read model assumes custody-paid expenses identify the custody ledger through `counter_account_code`; ambiguous historical rows remain outside the canonical metric until corrected.
