import {
  BalanceAssetsDto,
  BalanceCheckDto,
  BalanceObligationsDto,
  BalanceProfitDto,
  BalanceReceivablesDto,
} from '../models/balance-check.model';

/**
 * Coerces a (possibly partial) server payload into a fully-populated
 * `BalanceCheckDto`, so templates never have to guard against `null`
 * arrays or missing numbers. Totals are taken verbatim — the backend is the
 * source of truth — only absent values fall back to `0` / `[]`.
 */
export function normalizeBalanceCheck(
  raw: Partial<BalanceCheckDto> | null | undefined,
): BalanceCheckDto {
  const assets = normalizeAssets(raw?.assets);
  const obligations = normalizeObligations(raw?.obligations);
  const difference = num(raw?.difference, assets.total - obligations.total);

  return {
    assets,
    obligations,
    difference,
    isBalanced:
      typeof raw?.isBalanced === 'boolean' ? raw.isBalanced : difference === 0,
  };
}

function normalizeAssets(
  raw: Partial<BalanceAssetsDto> | null | undefined,
): BalanceAssetsDto {
  const receivables: Partial<BalanceReceivablesDto> = raw?.receivables ?? {};
  return {
    treasuriesTotal: num(raw?.treasuriesTotal),
    treasuries: list(raw?.treasuries),
    receivables: {
      amount: num(receivables.amount),
      contractsCount: num(receivables.contractsCount),
      installmentsCount: num(receivables.installmentsCount),
    },
    inventoryTotal: num(raw?.inventoryTotal),
    warehouses: list(raw?.warehouses),
    subAccountsTotal: num(raw?.subAccountsTotal),
    subAccounts: list(raw?.subAccounts),
    total: num(raw?.total),
  };
}

function normalizeObligations(
  raw: Partial<BalanceObligationsDto> | null | undefined,
): BalanceObligationsDto {
  const profit: Partial<BalanceProfitDto> = raw?.profit ?? {};
  return {
    shareholdersCapitalTotal: num(raw?.shareholdersCapitalTotal),
    shareholders: list(raw?.shareholders),
    profit: {
      grossContractsProfit: num(profit.grossContractsProfit),
      revenues: num(profit.revenues),
      expenses: num(profit.expenses),
      distributedProfit: num(profit.distributedProfit),
      representativeCommission: num(profit.representativeCommission),
      totalProfit: num(profit.totalProfit),
    },
    supplierPayablesTotal: num(raw?.supplierPayablesTotal),
    suppliers: list(raw?.suppliers),
    total: num(raw?.total),
  };
}

function num(value: unknown, fallback = 0): number {
  const n = typeof value === 'number' ? value : Number(value);
  return value !== null && value !== undefined && Number.isFinite(n)
    ? n
    : fallback;
}

function list<T>(value: readonly T[] | null | undefined): T[] {
  return Array.isArray(value) ? [...value] : [];
}
