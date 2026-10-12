import { BadgeType } from '../../../shared/components/badge/badge.component';
import { StatementTransactionType } from '../models/shareholder-statement.model';

export const STATEMENT_TX_LABELS: Readonly<Record<StatementTransactionType, string>> = {
  CapitalDeposit: 'إيداع رأس مال',
  CapitalWithdrawal: 'سحب رأس مال',
  ProfitCapitalization: 'ترحيل أرباح',
  ProfitDistribution: 'توزيع أرباح',
  DistributedProfitReinvestment: 'إضافة أرباح موزعة لرأس المال',
  DistributedProfitWithdrawal: 'صرف أرباح موزعة',
};

export const STATEMENT_TX_BADGE: Readonly<Record<StatementTransactionType, BadgeType>> = {
  CapitalDeposit: 'ok',
  CapitalWithdrawal: 'bad',
  ProfitCapitalization: 'purple',
  ProfitDistribution: 'teal',
  DistributedProfitReinvestment: 'ok',
  DistributedProfitWithdrawal: 'warn',
};

const STATEMENT_OUTFLOW_TYPES: ReadonlySet<StatementTransactionType> = new Set([
  'CapitalWithdrawal',
  'DistributedProfitWithdrawal',
]);

/** Returns true when the transaction adds to or pays out from the shareholder's stake. */
export function isStatementInflow(type: StatementTransactionType): boolean {
  return !STATEMENT_OUTFLOW_TYPES.has(type);
}

/**
 * Types that don't touch capital — the API reports `capitalBalanceAfter = 0`
 * for them, which must not be shown as a real balance.
 */
const NON_CAPITAL_TYPES: ReadonlySet<StatementTransactionType> = new Set([
  'ProfitDistribution',
  'DistributedProfitWithdrawal',
]);

export function affectsCapital(type: StatementTransactionType): boolean {
  return !NON_CAPITAL_TYPES.has(type);
}

/**
 * Statement rows the user may cancel from the statement. `ProfitDistribution`
 * ids are settlement ids (not vouchers) and capitalisation rows are immutable,
 * so both are excluded.
 */
const DELETABLE_STATEMENT_TYPES: ReadonlySet<StatementTransactionType> = new Set([
  'DistributedProfitReinvestment',
  'DistributedProfitWithdrawal',
]);

export function canDeleteStatementEntry(type: StatementTransactionType): boolean {
  return DELETABLE_STATEMENT_TYPES.has(type);
}
