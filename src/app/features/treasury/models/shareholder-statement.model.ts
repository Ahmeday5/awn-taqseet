export type StatementTransactionType =
  | 'CapitalDeposit'
  | 'CapitalWithdrawal'
  | 'ProfitCapitalization'
  | 'ProfitDistribution'
  | 'DistributedProfitReinvestment'
  | 'DistributedProfitWithdrawal';

export interface StatementEntry {
  id: number;
  voucherNumber: string;
  date: string;
  transactionType: StatementTransactionType;
  amount: number;
  companyShare: number | null;
  shareholderShare: number | null;
  capitalBalanceAfter: number;
  treasuryName: string;
  notes: string | null;
  capitalClassificationId: number | null;
  capitalClassificationName: string | null;
}

export interface ShareholderStatementHeader {
  id: number;
  name: string;
  phoneNumber: string;
  address: string;
  contributedAmount: number;
  ownedPercentage: number;
  companyPercentage: number;
  totalProfitReceived: number;
  accruedProfit: number;
  capitalTreasuryId: number;
  capitalTreasuryName: string;
  notes: string | null;
  createdAt: string;
}

export interface ShareholderStatement {
  shareholder: ShareholderStatementHeader;
  totalCapitalDeposited: number;
  totalCapitalWithdrawn: number;
  totalProfitCapitalized: number;
  totalProfitDistributed: number;
  /** Portion of `totalProfitDistributed` already booked back into capital. */
  totalDistributedProfitReinvested: number;
  /** Portion of `totalProfitDistributed` already paid out in cash. */
  totalDistributedProfitWithdrawn: number;
  /** Distributed profit still available (`totalProfitDistributed − reinvested − withdrawn`). */
  distributedProfitBalance: number;
  accruedProfit: number;
  /** Net capital = deposits + capitalised profit − withdrawals. */
  netCapitalBalance: number;
  entries: {
    pageIndex: number;
    pageSize: number;
    count: number;
    totalPages: number;
    data: StatementEntry[];
  };
}

export interface StatementQuery {
  pageIndex?: number;
  pageSize?: number;
  fromDate?: string;
  toDate?: string;
  /** Optional filter by capital classification. */
  classificationId?: number | null;
}
