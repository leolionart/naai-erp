# ERP-872 Risks

- The backfill is based on the reviewed ERP-800 source rows and explicit owner confirmation in this session. Future statement imports must retain the stable provider IDs to avoid duplicate physical-bank history.
- The separate VND 27,320,000 posted equipment expense dated 2025-07-25 was not modified; it is a distinct canonical record from the 2025-07-30 custody withdrawal.
- The four VND 13,000,000 `Tiền cá nhân` bank rows remain outside this backfill because their owner-withdrawal versus company-custody purpose still requires explicit classification.
