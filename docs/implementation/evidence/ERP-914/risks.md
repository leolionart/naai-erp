# ERP-914 risks

- Invoice-number extraction depends on recognizable labels such as `Số (Inv No.)`, `Số hóa đơn` or
  `Invoice No.`. Unknown invoice templates should add an OCR alias instead of guessing from the file
  name.
- VND normalization removes a trailing `.00` or `,00`, then strips separators. Non-VND decimal
  currencies need a separate currency-aware conversion contract.
- Missing required OCR values remain empty/null and are rejected by the ERP structured validation;
  the expression does not fabricate business data.
