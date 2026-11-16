/**
 * Wire contract for `GET dashboard/balance-check`.
 *
 * The endpoint reconciles everything the company owns (assets) against
 * everything it owes (obligations). `difference = assets.total -
 * obligations.total` and `isBalanced` is the server's verdict — the client
 * never re-derives it (rounding rules live on the backend).
 */

/** Profit treasuries are excluded server-side, so only these three appear. */
export type BalanceTreasuryType = 'Main' | 'SubRepresentative' | 'Bank';

export interface BalanceTreasuryDto {
  id: number;
  name: string;
  /** Kept open (`string`) so an unknown future type degrades to a neutral badge. */
  type: BalanceTreasuryType | string;
  balance: number;
}

export interface BalanceReceivablesDto {
  amount: number;
  contractsCount: number;
  installmentsCount: number;
}

export interface BalanceWarehouseDto {
  id: number;
  name: string;
  quantity: number;
  /** Stock value at purchase cost. */
  value: number;
}

export interface BalanceSubAccountDto {
  id: number;
  name: string;
  representativeId: number | null;
  balance: number;
}

export interface BalanceAssetsDto {
  treasuriesTotal: number;
  treasuries: BalanceTreasuryDto[];
  receivables: BalanceReceivablesDto;
  inventoryTotal: number;
  warehouses: BalanceWarehouseDto[];
  subAccountsTotal: number;
  subAccounts: BalanceSubAccountDto[];
  total: number;
}

/**
 * Id of the synthetic "الشركة" line the API puts first in
 * `obligations.shareholders` — its `contributedAmount` is the company balance.
 */
export const COMPANY_SHAREHOLDER_ID = 0;

export interface BalanceShareholderDto {
  /** `COMPANY_SHAREHOLDER_ID` (0) for the company's own line. */
  id: number;
  name: string;
  /** May be negative on the company line. */
  contributedAmount: number;
}

export function isCompanyShareholderLine(row: BalanceShareholderDto): boolean {
  return row.id === COMPANY_SHAREHOLDER_ID;
}

/**
 * `totalProfit = grossContractsProfit + revenues - expenses
 *               - distributedProfit - representativeCommission`
 */
export interface BalanceProfitDto {
  grossContractsProfit: number;
  revenues: number;
  expenses: number;
  distributedProfit: number;
  representativeCommission: number;
  totalProfit: number;
}

export interface BalanceSupplierDto {
  id: number;
  name: string;
  invoicesCount: number;
  outstanding: number;
}

export interface BalanceObligationsDto {
  /** Shareholders' capital + the company balance. */
  shareholdersCapitalTotal: number;
  /** Starts with the company line (`id: 0`), then the real shareholders. */
  shareholders: BalanceShareholderDto[];
  /** The company balance alone (already inside the total and the list). */
  companyBalance: number;
  profit: BalanceProfitDto;
  supplierPayablesTotal: number;
  suppliers: BalanceSupplierDto[];
  total: number;
}

export interface BalanceCheckDto {
  assets: BalanceAssetsDto;
  obligations: BalanceObligationsDto;
  /** `assets.total - obligations.total` */
  difference: number;
  /** `true` when `difference == 0` (server-side rounding). */
  isBalanced: boolean;
}
