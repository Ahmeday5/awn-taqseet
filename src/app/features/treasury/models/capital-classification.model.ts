import { PagedResponse } from '../../../core/models/api-response.model';

/** تصنيف رأس المال — a label shareholders' capital movements can be tagged with. */
export interface CapitalClassification {
  id: number;
  name: string;
  notes: string | null;
  createdAt: string;
  /** Capital movements using this classification — delete is rejected when > 0. */
  transactionsCount: number;
}

/** POST / PUT body. `name` required (max 200), `notes` optional (max 1000). */
export interface CapitalClassificationPayload {
  name: string;
  notes?: string | null;
}

export interface CapitalClassificationsQuery {
  pageIndex?: number;
  pageSize?: number;
  search?: string;
}

/** One movement in a classification's statement — newest first. */
export interface CapitalClassificationStatementEntry {
  id: number;
  voucherNumber: string;
  date: string;
  shareholderId: number;
  shareholderName: string;
  transactionType: string;
  transactionTypeAr: string;
  amount: number;
  /** Positive for deposits, negative for withdrawals. */
  signedAmount: number;
  /** May be negative. */
  runningBalance: number;
  treasuryName: string;
  notes: string | null;
}

export interface CapitalClassificationStatement {
  classification: CapitalClassification;
  totalDeposits: number;
  totalWithdrawals: number;
  /** May be negative. */
  netBalance: number;
  entries: PagedResponse<CapitalClassificationStatementEntry>;
}

export interface CapitalClassificationStatementQuery {
  pageIndex?: number;
  pageSize?: number;
  fromDate?: string;
  toDate?: string;
}

export const CLASSIFICATION_NAME_MAX = 200;
export const CLASSIFICATION_NOTES_MAX = 1000;
