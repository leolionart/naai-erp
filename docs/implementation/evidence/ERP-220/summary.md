# ERP-220 Summary

Implemented the accounting workflow and its AI-native command surface.

- Drafts record their submitter and expose approve as the next action.
- Approval requires an authorized approver, reason and maker/checker evaluation.
- Small-team self-approval is disabled by default and only allowed below an explicit organization threshold; audit metadata flags it.
- Posting now requires approved state and remains balanced, atomic, audited, idempotent and organization scoped.
- Reversal creates a separately posted inverse journal, preserves the original and marks it reversed through a narrowly constrained database transition.
- Repost creates one corrected replacement draft linked to the reversed original.
- REST/OpenAPI and CLI expose approve, post, reverse and repost without direct database access.

Start commit: `3f855cb198dec2f704699771010f6a2b576bcf73`.
