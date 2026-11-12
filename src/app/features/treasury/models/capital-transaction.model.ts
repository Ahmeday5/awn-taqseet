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
  capitalClassificationId: number | null;
  capitalClassificationName: string | null;
}

export interface CreateCapitalTransactionPayload {
  type: CapitalTransactionType;
  amount: number;
  treasuryId: number;
  /** `yyyy-MM-dd` — calendar date, not a timestamp. */
  date: string;
  notes: string;
  /** Optional capital classification (تصنيف رأس المال). */
  capitalClassificationId: number | null;
}

/**
 * PUT /shareholders/{id}/capital-transactions/{txId} — edits a deposit/withdrawal
 * in place. `capitalClassificationId` must always carry the current value:
 * null CLEARS the classification server-side.
 */
export interface UpdateCapitalTransactionPayload {
  type: CapitalTransactionType;
  amount: number;
  treasuryId: number;
  /** `yyyy-MM-dd` — calendar date, not a timestamp. */
  date: string;
  notes: string;
  capitalClassificationId: number | null;
}

export interface CapitalizeProfitPayload {
  /** Ignored by the server now — send 0 or omit. */
  profitsTreasuryId?: number;
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

/**
 * POST /shareholders/{id}/withdraw-distributed-profit — pays part of the
 * shareholder's distributed profit out in cash from the chosen treasury.
 * Capital is untouched.
 */
export interface WithdrawDistributedProfitPayload {
  amount: number;
  treasuryId: number;
  /** `yyyy-MM-dd` — omitted to let the server default to today. */
  date?: string;
  notes?: string;
}

/** POST /shareholders/reinvest-all-distributed-profits — books every shareholder's full balance into capital. */
export interface ReinvestAllDistributedProfitsPayload {
  /** `yyyy-MM-dd` — omitted to let the server default to today. */
  date?: string;
  notes?: string;
}

export interface ReinvestAllDistributedProfitsLine {
  shareholderId: number;
  shareholderName: string;
  amount: number;
  contributedAmountAfter: number;
  voucherNumber: string;
}

export interface ReinvestAllDistributedProfitsResult {
  totalReinvested: number;
  lines: ReinvestAllDistributedProfitsLine[];
}

/** POST /shareholders/capitalize-all-profits — rolls every shareholder's AccruedProfit into capital. */
export interface CapitalizeAllProfitsPayload {
  /** Ignored by the server now — send 0 or omit. */
  profitsTreasuryId?: number;
  /** `yyyy-MM-dd` — calendar date, not a timestamp. */
  date: string;
  notes: string;
}

/**
 * Response of the capitalise endpoints. `companyReceiptVoucherNumber` is the
 * single receipt voucher booking the company's share; `paymentVoucherNumber`
 * on lines is always empty now.
 */
export interface CapitalizeProfitsResult {
  companyReceiptVoucherNumber?: string | null;
  [key: string]: unknown;
}

/** Query parameters for the paginated capital-transactions history. */
export interface CapitalTransactionsQuery {
  pageIndex?: number;
  pageSize?: number;
  /** Optional filter by capital classification. */
  classificationId?: number | null;
}
