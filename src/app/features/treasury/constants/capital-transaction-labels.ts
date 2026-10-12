import { BadgeType } from '../../../shared/components/badge/badge.component';
import {
  CapitalTransactionDirection,
  CapitalTransactionType,
} from '../models/capital-transaction.model';

/* ────────────────────────────────────────────────────────────────
   Request type — Receipt (إيداع) / Payment (سحب)
   ──────────────────────────────────────────────────────────────── */

export const CAPITAL_TX_TYPE_OPTIONS: ReadonlyArray<{
  value: CapitalTransactionType;
  label: string;
}> = [
  { value: CapitalTransactionType.Receipt, label: 'إيداع رأس مال' },
  { value: CapitalTransactionType.Payment, label: 'سحب من رأس المال' },
];

/* ────────────────────────────────────────────────────────────────
   Server direction — Deposit / Payment / ProfitCapitalization / …
   ──────────────────────────────────────────────────────────────── */

export const CAPITAL_TX_DIRECTION_LABELS: Readonly<
  Record<CapitalTransactionDirection, string>
> = {
  Deposit: 'إيداع',
  Withdrawal: 'سحب',
  Payment: 'سحب',
  ProfitCapitalization: 'ترحيل أرباح',
  DistributedProfitReinvestment: 'إضافة أرباح موزعة لرأس المال',
};

export const CAPITAL_TX_DIRECTION_BADGE: Readonly<
  Record<CapitalTransactionDirection, BadgeType>
> = {
  Deposit: 'ok',
  Withdrawal: 'bad',
  Payment: 'bad',
  ProfitCapitalization: 'purple',
  DistributedProfitReinvestment: 'ok',
};

const CAPITAL_INFLOW_DIRECTIONS: ReadonlySet<CapitalTransactionDirection> =
  new Set(['Deposit', 'ProfitCapitalization', 'DistributedProfitReinvestment']);

/** A movement that increases the shareholder's capital (used for sign/colour). */
export function isCapitalInflow(
  direction: CapitalTransactionDirection,
): boolean {
  return CAPITAL_INFLOW_DIRECTIONS.has(direction);
}

/* ────────────────────────────────────────────────────────────────
   Row capabilities — mirror what the API accepts per direction
   ──────────────────────────────────────────────────────────────── */

/** Directions the API lets us edit in place (PUT). */
const EDITABLE_DIRECTIONS: ReadonlySet<CapitalTransactionDirection> = new Set([
  'Deposit',
  'Withdrawal',
  'Payment',
]);

/**
 * Directions the API lets us delete. Deleting a distributed-profit
 * reinvestment returns its amount to the shareholder's distributed-profit
 * balance; profit-capitalisation rows stay immutable.
 */
const DELETABLE_DIRECTIONS: ReadonlySet<CapitalTransactionDirection> = new Set([
  ...EDITABLE_DIRECTIONS,
  'DistributedProfitReinvestment',
]);

export function canEditCapitalTx(direction: CapitalTransactionDirection): boolean {
  return EDITABLE_DIRECTIONS.has(direction);
}

export function canDeleteCapitalTx(direction: CapitalTransactionDirection): boolean {
  return DELETABLE_DIRECTIONS.has(direction);
}
