export type CompanyProfitVoucherType = 'Receipt' | 'Payment';

/** Origin of a statement line: a voucher, or a movement between treasuries. */
export type CompanyProfitEntrySource = 'Voucher' | 'Transfer';

export type CompanyProfitReferenceType =
  | 'ShareholderProfitCapitalization'
  | 'ProfitDistribution'
  | 'TransferIn'
  | 'TransferOut'
  /** Manual deposit/withdrawal against the company balance. */
  | 'CompanyCapitalAdjustment'
  // Forward-compatible: unknown types fall back to the raw value.
  | (string & {});

export interface CompanyProfitEntry {
  /**
   * Voucher id for `Voucher` lines, treasury-movement id for `Transfer`
   * lines — the two can collide, so never use `id` alone as a key, and
   * never link a `Transfer` id to the voucher page.
   */
  id: number;
  date: string;
  source: CompanyProfitEntrySource;
  voucherType: CompanyProfitVoucherType;
  amount: number;
  balanceAfter: number;
  referenceType: CompanyProfitReferenceType;
  referenceId: number | null;
  /** Set on `Voucher` lines tied to a shareholder; null otherwise. */
  shareholderId: number | null;
  shareholderName: string | null;
  /** Set on `Transfer` lines only: the treasury on the other side of the move. */
  counterpartyTreasuryName: string | null;
  notes: string | null;
}

export interface CompanyProfitStatement {
  /** Includes incoming treasury transfers. */
  totalReceived: number;
  /** Includes outgoing treasury transfers. */
  totalPaid: number;
  currentBalance: number;
  /**
   * currentBalance − (totalReceived − totalPaid). Expected to be 0; anything
   * else signals a data inconsistency the user must see.
   */
  unexplainedDifference: number;
  entries: {
    pageIndex: number;
    pageSize: number;
    count: number;
    totalPages: number;
    data: CompanyProfitEntry[];
  };
}

export interface CompanyProfitStatementQuery {
  pageIndex?: number;
  pageSize?: number;
  fromDate?: string;
  toDate?: string;
}
