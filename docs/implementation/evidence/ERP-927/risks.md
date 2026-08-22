# ERP-927 risks

The stream covers persisted business mutations and operational telemetry. Successful read-only HTTP
requests, page views and health probes are not audit events. Operational rows retain their bounded
retention; immutable audit rows do not expire.
