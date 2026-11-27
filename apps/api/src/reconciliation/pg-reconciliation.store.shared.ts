import { createHash } from "node:crypto";

export const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
export type BankRow = {
  id: string;
  state: string;
  amount_minor: string;
  currency: string;
  booking_date: string;
  reference: string | null;
  description: string;
  counterparty_name: string | null;
  financial_account_id: string;
  ledger_account_code: string;
  base_currency: string;
  version: string;
};
