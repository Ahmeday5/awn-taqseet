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
   * Display-only: no edit/delete/statement/capital actions, and it is not
   * counted in the pagination `count`. Its `contributedAmount` may be negative.
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

/** VoucherType on the wire: 1 = Receipt (إيداع), 2 = Payment (سحب). */
export enum CompanyBalanceTxType {
  Deposit = 1,
  Withdrawal = 2,
}

/** POST/PUT `shareholders/company-balance/transactions[/{voucherId}]` body. */
export interface CompanyBalanceTransactionPayload {
  type: CompanyBalanceTxType;
  amount: number;
  /** `yyyy-MM-dd` — omitted to let the server default to today. */
  date?: string;
  notes?: string;
}

export interface CompanyBalanceTransaction {
  id: number;
  voucherNumber: string;
  type: CompanyBalanceTxType | string;
  amount: number;
  date: string;
  treasuryId: number;
  treasuryName: string;
  /** May be negative — withdrawals are never blocked. */
  companyBalanceAfter: number;
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
