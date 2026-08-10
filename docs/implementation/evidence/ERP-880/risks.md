# ERP-880 risks

- Browser QA covered desktop Chromium and the existing local viewport. Mobile behavior is unchanged
  and remains covered by the existing Sheet navigation tests rather than this collapsed-sidebar test.
- The Owner Current page currently logs duplicate React-key errors from its table records. They were
  observed during QA but are outside ERP-880 and did not affect the submenu interaction.
- No production deployment or push was performed in this task.
