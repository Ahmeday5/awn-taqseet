import { PagedResponse } from '../../../core/models/api-response.model';

export type CompanyProfitVoucherType = 'Receipt' | 'Payment';

/**
 * Origin of a statement line:
 * - `Voucher`     a voucher (settlement / capitalisation / manual deposit or withdrawal)
 * - `Transfer`    a movement between treasuries
 * - `ProfitShare` the company's own cut of a booked profit (or of its reversal)
 */
export type CompanyProfitEntrySource = 'Voucher' | 'Transfer' | 'ProfitShare';

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
   * Source-scoped id — a voucher id, a treasury-movement id or a profit-share
   * id. Ids from different sources can collide, so never key on `id` alone.
   * For `isEditable` lines it is the id the company-balance PUT/DELETE take.
   */
  id: number;
  voucherNumber: string | null;
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
  /**
   * Treasury the money came from / went to — set for manual deposits and
   * withdrawals and for treasury transfers. Null on legacy movements.
   */
  counterpartyTreasuryId: number | null;
  counterpartyTreasuryName: string | null;
  capitalClassificationId: number | null;
  capitalClassificationName: string | null;
  /** True only for manual deposits/withdrawals — the lines users may edit or delete. */
  isEditable: boolean;
  notes: string | null;
}

export interface CompanyProfitStatement {
  /** Within the requested period when one is given, else over every movement. */
  totalReceived: number;
  /** Within the requested period when one is given, else over every movement. */
  totalPaid: number;
  /** `totalReceived − totalPaid` — same scope as the totals. */
  netBalance: number;
  /** The company balance right now — never affected by the date filter. */
  currentBalance: number;
  /**
   * Always computed over every movement. Expected to be 0; anything else
   * signals a data inconsistency the user must see.
   */
  unexplainedDifference: number;
  entries: PagedResponse<CompanyProfitEntry>;
}

export interface CompanyProfitStatementQuery {
  pageIndex?: number;
  pageSize?: number;
  fromDate?: string;
  toDate?: string;
}
