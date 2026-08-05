export const internalTransferApi = Object.freeze({
  list: "banking/internal-transfers",
  detail(id: string) {
    return `banking/internal-transfers/${encodeURIComponent(id)}`;
  },
  candidates(transactionId: string) {
    return `banking/transactions/${encodeURIComponent(transactionId)}/transfer-candidates`;
  },
  match(id: string) {
    return `${this.detail(id)}/match`;
  },
  unmatch(id: string) {
    return `${this.detail(id)}/unmatch`;
  },
});

export function currentInternalTransferAttempt<
  T extends {
    currentAttemptNumber: number;
    attempts: readonly { attemptNumber: number }[];
  },
>(transfer: T | undefined): T["attempts"][number] | undefined {
  if (!transfer) return undefined;
  return transfer.attempts.find(
    (attempt) => attempt.attemptNumber === transfer.currentAttemptNumber,
  ) as T["attempts"][number] | undefined;
}
