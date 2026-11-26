# Remaining risks

- The reporter's own deployment was not inspected (private network); causes are inferred from code and must be confirmed with the queries in the runbook.
- Inbound requests rejected before the source is resolved (bad public id/signature of an unknown source) have no organization and are not logged.
