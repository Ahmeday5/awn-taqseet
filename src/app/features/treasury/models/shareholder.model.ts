/** Row / detail shape returned by `GET /dashboard/shareholders[/{id}]`. */
export interface Shareholder {
  id: number;
  name: string;
  phoneNumber: string;
  address: string;
  /** Capital injected by this shareholder — set once on create, server-managed after. */
  contributedAmount: number;
  /** Server-derived share of total capital (%). */
  ownedPercentage: number;
  companyPercentage: number;
  /** Cumulative profit distributed to this shareholder so far. */
  totalProfitReceived: number;
  /** Profit accrued from installment payments, not yet settled or capitalised. */
  accruedProfit: number;
  capitalTreasuryId: number;
  capitalTreasuryName: string;
  notes: string | null;
  createdAt: string;
  /**
   * True only for the synthetic "الشركة" row (id 0) the API prepends on page 1.
   * Its `ownedPercentage` is a real profit share (the company earns like a
   * shareholder). No edit/delete/capital actions — its statement is the
   * company statement — and it is not counted in the pagination `count`.
   * Its `contributedAmount` (the company balance) may be negative.
   */
  isCompany?: boolean;
}

/** `GET /dashboard/shareholders/summary` — header cards. */
export interface ShareholdersSummary {
  shareholdersCount: number;
  totalShareholdersCapital: number;
  /** May be negative. */
  companyBalance: number;
  totalIncludingCompany: number;
}

/**
 * Voucher type on the wire (sent and received as a string):
 * `Receipt` = إيداع (money into the treasury, company balance up),
 * `Payment` = سحب (money out of the treasury, company balance down).
 */
export enum CompanyBalanceTxType {
  Deposit = 'Receipt',
  Withdrawal = 'Payment',
}

/** Movement direction as labelled by the API on the response. */
export type CompanyBalanceTxDirection = 'Deposit' | 'Withdrawal';

/**
 * POST/PUT `shareholders/company-balance/transactions[/{id}]` body.
 *
 * PUT semantics: `treasuryId: null` keeps the current treasury, while
 * `capitalClassificationId: null` CLEARS the classification — so an edit
 * must always resend the current classification to keep it.
 */
export interface CompanyBalanceTransactionPayload {
  type: CompanyBalanceTxType;
  /** > 0 */
  amount: number;
  /** `yyyy-MM-dd`; null lets the server default to today. */
  date: string | null;
  /** Required on create ("الخزنة مطلوبة."). */
  treasuryId: number | null;
  capitalClassificationId: number | null;
  notes: string | null;
}

/** `CompanyBalanceTransactionDto` — response of POST / PUT. */
export interface CompanyBalanceTransaction {
  id: number;
  voucherNumber: string;
  type: CompanyBalanceTxType;
  direction: CompanyBalanceTxDirection;
  amount: number;
  /** Company balance right after this movement. May be negative. */
  balanceAfter: number;
  date: string;
  /** Null for legacy movements recorded before treasuries were required. */
  treasuryId: number | null;
  treasuryName: string | null;
  capitalClassificationId: number | null;
  capitalClassificationName: string | null;
  notes: string | null;
  userName: string | null;
}

/**
 * The fields the company-balance form needs to edit an existing movement —
 * decoupled from any one DTO so it can be built from a statement line.
 */
export interface CompanyBalanceTxEditTarget {
  id: number;
  voucherNumber: string | null;
  type: CompanyBalanceTxType;
  amount: number;
  date: string;
  treasuryId: number | null;
  treasuryName: string | null;
  capitalClassificationId: number | null;
  notes: string | null;
}

/** `POST shareholders/company-balance/reconcile-historical` (Admin, idempotent). */
export interface ReconcileHistoricalResult {
  vouchersReversed: number;
  transactionsRemoved: number;
  totalRestored: number;
  treasuries: Array<{
    treasuryId: number;
    treasuryName: string;
    amountRestored: number;
  }>;
}

export interface CreateShareholderPayload {
  name: string;
  phoneNumber: string;
  address: string;
  contributedAmount: number;
  companyPercentage: number;
  capitalTreasuryId: number;
  notes: string;
}

/**
 * PUT /dashboard/shareholders/{id} body. Only descriptive fields are editable;
 * the contribution and its treasury are immutable post-creation.
 */
export interface UpdateShareholderPayload {
  name: string;
  phoneNumber: string;
  address: string;
  companyPercentage: number;
  notes: string;
}

/** Query parameters for `GET /dashboard/shareholders` — `search` matches name or phone. */
export interface ShareholdersQuery {
  pageIndex?: number;
  pageSize?: number;
  search?: string;
}
