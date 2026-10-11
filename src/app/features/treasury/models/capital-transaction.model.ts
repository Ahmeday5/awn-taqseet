export enum CapitalTransactionType {
  Receipt = 'Receipt',
  Payment = 'Payment',
}

export type CapitalTransactionDirection =
  | 'Deposit'
  | 'Withdrawal'
  | 'Payment'
  | 'ProfitCapitalization'
  | 'DistributedProfitReinvestment';

/** Row shape returned by `GET /shareholders/{id}/capital-transactions` (paged). */
export interface CapitalTransaction {
  id: number;
  voucherNumber: string;
  type: CapitalTransactionType;
  direction: CapitalTransactionDirection;
  amount: number;
  /** Shareholder's capital balance immediately after this movement posted. */
  balanceAfter: number;
  /** ISO datetime as returned by the server. */
  date: string;
  treasuryId: number;
  treasuryName: string;
  notes: string | null;
  userName: string;
}

export interface CreateCapitalTransactionPayload {
  type: CapitalTransactionType;
  amount: number;
  treasuryId: number;
  /** `yyyy-MM-dd` — calendar date, not a timestamp. */
  date: string;
  notes: string;
}

/** PUT /shareholders/{id}/capital-transactions/{txId} — edits a deposit/withdrawal in place. */
export interface UpdateCapitalTransactionPayload {
  type: CapitalTransactionType;
  amount: number;
  treasuryId: number;
  /** `yyyy-MM-dd` — calendar date, not a timestamp. */
  date: string;
  notes: string;
}

export interface CapitalizeProfitPayload {
  profitsTreasuryId: number;
  amount: number;
  /** `yyyy-MM-dd` — calendar date, not a timestamp. */
  date: string;
  notes: string;
}

/**
 * POST /shareholders/{id}/reinvest-distributed-profit — books part of the
 * shareholder's already-distributed profit back into capital. Ledger-only:
 * no treasury is debited or credited, hence no treasury id.
 */
export interface ReinvestDistributedProfitPayload {
  amount: number;
  /** `yyyy-MM-dd` — omitted to let the server default to today. */
  date?: string;
  notes?: string;
}

/** POST /shareholders/capitalize-all-profits — rolls every shareholder's AccruedProfit into capital. */
export interface CapitalizeAllProfitsPayload {
  profitsTreasuryId: number;
  /** `yyyy-MM-dd` — calendar date, not a timestamp. */
  date: string;
  notes: string;
}

/** Query parameters for the paginated capital-transactions history. */
export interface CapitalTransactionsQuery {
  pageIndex?: number;
  pageSize?: number;
}
