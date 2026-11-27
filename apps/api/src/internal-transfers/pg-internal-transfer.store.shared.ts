import { createHash } from "node:crypto";

export const digest = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex");
export type Tx = {
  id: string;
  state: string;
  amount_minor: string;
  currency: string;
  booking_date: string;
  reference: string | null;
  description: string;
  financial_account_id: string;
  ledger_account_code: string;
};
