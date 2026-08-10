# ERP-878 risks

- Changing an expense category's funding treatment affects the compatibility read of legacy lines
  whose immutable funding snapshot is null. Lines with a persisted snapshot remain historically
  stable.
- The production prediction requires release and deployment readback before it can be treated as the
  live rendered result.
- No posted expense, journal or dashboard balance is rewritten by this change.

