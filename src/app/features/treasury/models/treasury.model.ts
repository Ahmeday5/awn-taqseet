import { TreasuryType } from '../enums/treasury-type.enum';

export type TransactionType = 'income' | 'expense' | 'transfer';

/**
 * Treasury entity exactly as returned by `GET /dashboard/treasuries`.
 * No separate "view" DTO — the API shape *is* the view model.
 *
 * `transactions` and `vouchers` are returned as empty arrays by the
 * backend today; typed as optional so they can grow without breaking
 * existing call-sites.
 */
export interface Treasury {
  id: number;
  name: string;
  currentBalance: number;
  type: TreasuryType;
  isActive: boolean;
  /** Set only for `SubRepresentative` treasuries; null otherwise. */
  representativeId?: number | null;
  /** Display name of the linked representative (sub-rep treasuries only). */
  representative?: string | null;
  transactions?: TreasuryTransaction[];
  vouchers?: TreasurySummary[];
}

/**
 * POST /dashboard/treasuries — `initialBalance` is set ONCE at creation.
 * `representativeId` is sent ONLY for `SubRepresentative` treasuries and is
 * `null` for every other type.
 */
export interface CreateTreasuryPayload {
  name: string;
  initialBalance: number;
  type: TreasuryType;
  isActive: boolean;
  representativeId: number | null;
}

/**
 * PUT /dashboard/treasuries/{id} — balance is server-managed, not editable.
 * `representativeId` follows the same rule as on create.
 */
export interface UpdateTreasuryPayload {
  name: string;
  type: TreasuryType;
  isActive: boolean;
  representativeId: number | null;
}

export interface TreasuryTransaction {
  id: string;
  date: string;
  description: string;
  type: TransactionType;
  amount: number;
  balance: number;
  category: string;
}

export interface TreasurySummary {
  mainBalance: number;
  monthlyIncome: number;
  monthlyExpense: number;
  netCashflow: number;
  vatCollected: number;
  vatPaid: number;
}

/* ════════════════════════════════════════════════════════════════
   Treasury transfers (inter-treasury money movements)
   ════════════════════════════════════════════════════════════════ */

/** Row shape returned by `GET /dashboard/treasuries/transfers`. */
export interface TreasuryTransfer {
  id: number;
  fromTreasuryId: number;
  fromTreasuryName: string;
  toTreasuryId: number;
  toTreasuryName: string;
  amount: number;
  /** ISO date (server returns date-only or full ISO depending on field). */
  transferDate: string;
  notes: string | null;
  createdAt: string;
}

/** POST /dashboard/treasuries/transfers body. */
export interface CreateTreasuryTransferPayload {
  fromTreasuryId: number;
  toTreasuryId: number;
  amount: number;
  /** `yyyy-MM-dd` — the backend expects a calendar date, not a timestamp. */
  transferDate: string;
  notes: string;
}

/**
 * PUT /dashboard/treasuries/transfers/{id} body. Omitting `transferDate`
 * keeps the stored date; `notes` is written as sent — `null` clears it.
 */
export interface UpdateTreasuryTransferPayload {
  fromTreasuryId: number;
  toTreasuryId: number;
  amount: number;
  transferDate?: string;
  notes: string | null;
}

/** Query parameters for the paginated transfers list. */
export interface TreasuryTransfersQuery {
  pageIndex?: number;
  pageSize?: number;
  fromTreasuryId?: number | '';
  toTreasuryId?: number | '';
  /** `yyyy-MM-dd` — inclusive lower bound. */
  from?: string;
  /** `yyyy-MM-dd` — inclusive upper bound. */
  to?: string;
}

/* ════════════════════════════════════════════════════════════════
   Treasury operations (all transactions/movements)
   ════════════════════════════════════════════════════════════════ */

/** Counterparty of a treasury operation (`Treasury` = the other leg of an inter-treasury transfer). */
export type OperationPartyType =
  | 'Customer'
  | 'Supplier'
  | 'Shareholder'
  | 'SubAccount'
  | 'Representative'
  | 'Treasury';

/** Row shape returned by `GET /dashboard/treasuries/operations`. */
export interface TreasuryOperation {
  id: number;
  description: string;
  amount: number;
  signedAmount: number; // positive for Receipt, negative for Payment
  direction: 'Payment' | 'Receipt';
  date: string; // ISO datetime
  userName: string;
  balanceAfter: number;
  treasuryId: number;
  treasuryName: string;
  partyName: string | null;
  partyType: OperationPartyType | null;
  partyId: number | null;
  /** Source document of the operation (informational). */
  referenceType: string;
  referenceId: number | null;
  /** False when the operation must be edited/deleted from its originating screen. */
  canEdit: boolean;
  canDelete: boolean;
}

/**
 * PUT /dashboard/treasuries/operations/{id} body. `date` (`YYYY-MM-DD`) equal
 * to the original or `null` keeps the stored date and time; `notes` replaces
 * the stored description as sent.
 */
export interface UpdateTreasuryOperationPayload {
  amount: number;
  date: string | null;
  notes: string | null;
}

/** Query parameters for the paginated operations list. */
export interface TreasuryOperationsQuery {
  pageIndex?: number;
  pageSize?: number;
  treasuryId?: number | '';
  /** `yyyy-MM-dd` — inclusive lower bound. */
  from?: string;
  /** `yyyy-MM-dd` — inclusive upper bound. */
  to?: string;
}

/* ════════════════════════════════════════════════════════════════
   Profits screen — `GET /dashboard/treasuries/monthly-profits`
   Every profit figure may be negative (loss months, overdrawn
   balances): render as-is, never clamp.
   ════════════════════════════════════════════════════════════════ */

export interface ProfitsScreenQuery {
  year?: number;
  /** Admin filter; never sent for a Representative (scoped server-side). */
  representativeId?: number;
}

export interface ProfitsScreen {
  year: number;
  treasuries: ProfitTreasuries;
  summary: ProfitsSummary;
  monthlySalesProfits: MonthlyTable<MonthlySalesProfit>;
  monthlyProfitDistribution: MonthlyTable<MonthlyProfitDistribution>;
  explanations: ProfitExplanation[];
}

/** How a figure is computed. `field` is PascalCase, e.g. `NetProfit`. */
export interface ProfitExplanation {
  field: string;
  title: string;
  formula: string;
}

export interface ProfitTreasuries {
  /** Unsettled profits = companyPendingShare + shareholdersPendingShare. */
  profitsTreasury: number;
  companyPendingShare: number;
  shareholdersPendingShare: number;
  /** What has actually been settled into the company's treasury. */
  companyProfitsTreasury: number;
  /** companyProfitsTreasury + companyPendingShare. */
  companyTotalProfit: number;
  representativesProfitsTotal: number;
  representatives: RepresentativeProfit[];
  shareholders: ShareholderPendingProfit[];
}

export interface RepresentativeProfit {
  representativeId: number;
  representativeName: string;
  amount: number;
}

export interface ShareholderPendingProfit {
  shareholderId: number;
  shareholderName: string;
  accruedProfit: number;
  /** 0–100 scale. */
  companyPercentage: number;
  companyShare: number;
  shareholderShare: number;
}

export interface ProfitsSummary {
  totalProfits: number;
  distributedProfits: number;
  currentProfits: number;
  collectedProfits: number;
  directRevenues: number;
  expenses: number;
  /** collectedProfits + directRevenues − expenses. */
  netProfits: number;
}

export interface MonthlyTable<T> {
  /** Always 12 months. */
  months: T[];
  /** Yearly total row (`month = 0`). */
  total: T | null;
}

export interface MonthlySalesProfit {
  month: number;
  monthName: string;
  isCurrentMonth: boolean;
  cashProfit: number;
  installmentProfit: number;
  salesProfit: number;
  collectedProfit: number;
  collectedFromInstallments: number;
  collectedFromCashSales: number;
  directRevenues: number;
  expenses: number;
  netProfit: number;
}

export interface MonthlyProfitDistribution {
  month: number;
  monthName: string;
  isCurrentMonth: boolean;
  netProfit: number;
  /** companyProfit + shareholdersProfit + representativesProfit (= netProfit). */
  distributedProfit: number;
  /** netProfit − representativesProfit. */
  shareholdersPool: number;
  companyProfit: number;
  shareholdersProfit: number;
  representativesProfit: number;
  representatives: RepresentativeMonthlyProfit[];
  shareholders: ShareholderMonthlyProfit[];
}

export interface RepresentativeMonthlyProfit {
  representativeId: number;
  representativeName: string;
  /** fromContracts + fromRevenues − fromExpenses. */
  amount: number;
  fromContracts: number;
  fromRevenues: number;
  /** Subtracted from the total. */
  fromExpenses: number;
}

export interface ShareholderMonthlyProfit {
  shareholderId: number;
  shareholderName: string;
  /** Share of paid-in capital, 0–100. */
  contributionPercentage: number;
  poolShare: number;
  /** 0–100 scale. */
  companyPercentage: number;
  companyShare: number;
  shareholderShare: number;
}
