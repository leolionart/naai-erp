# ERP-972 Risks

- None; double-reversal is prevented by checking `state === 'reversed'` and requiring an existing `reversal_of_id` row.
