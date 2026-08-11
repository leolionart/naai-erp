# ERP-914 summary

Replaced the Expense automation OCR staging expression with one paste-ready n8n JSON expression
whose result is the exact ERP-913 purchase-invoice ingestion request body.

The expression normalizes Vietnamese tax IDs, dates with time suffixes and dot/comma formatted VND
amounts. It accepts OCR field aliases, extracts a missing invoice number from Paperless content and
constructs the canonical Paperless download URL from the document ID.
