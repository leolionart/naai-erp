# ERP-872 Summary

Created the canonical cash financial account `cash-owner-custody` linked to `111-CASH`, then restored four reviewed “Rút tiền mặt sử dụng” source movements through existing banking APIs.

Each source was imported as a negative company-bank leg and a positive owner-custody cash leg, then reconciled through the existing direct internal-transfer workflow. The four transfers total VND 135,320,000 and post Dr `111-CASH` / Cr `112-BANK`. They do not touch `3388-OWNER` and do not affect P&L.

The same canonical workflow was executed and read back on `https://erp.naai.studio` for organization `naai`. The production-backed localhost UI now shows all four cash legs under “Lịch sử nộp/rút quỹ tiền mặt”.
