import { PagedResponse } from '../../../core/models/api-response.model';

export type CompanyProfitVoucherType = 'Receipt' | 'Payment';

/**
 * Origin of a statement line:
 * - `Voucher`     a voucher (settlement / capitalisation / manual deposit or withdrawal)
 * - `Transfer`    a legacy movement between treasuries
 * - `ProfitShare` a legacy per-profit company cut — no longer returned once
 *                 the historical rows are consolidated into vouchers
 */
export type CompanyProfitEntrySource = 'Voucher' | 'Transfer' | 'ProfitShare';

export type CompanyProfitReferenceType =
  | 'ShareholderProfitCapitalization'
  | 'ProfitDistribution'
  | 'TransferIn'
  | 'TransferOut'
  /** Manual deposit/withdrawal against the company balance. */
  | 'CompanyCapitalAdjustment'
  /** Consolidated voucher of the company's own profit share. */
  | 'CompanyProfitShare'
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
  /**
   * Set on `Voucher` lines tied to a shareholder; null otherwise — including
   * the single company voucher of a distribution/capitalisation.
   */
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
  /**
   * Lines users may edit/delete: manual deposits/withdrawals, every payment
   * voucher (legacy ones included) and legacy transfers out of the company
   * balance. Edits/deletes must echo `source` back as a query param.
   */
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
   * The company's own profit share not yet posted to its balance — posted,
   * in one voucher, by the next capitalisation or distribution.
   */
  pendingProfit?: number;
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
