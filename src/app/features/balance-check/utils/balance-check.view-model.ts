import {
  ASSET_SECTIONS,
  AssetSectionKey,
  BalanceSectionKey,
  BalanceSectionMeta,
  BalanceTone,
  OBLIGATION_SECTIONS,
  ObligationSectionKey,
  PROFIT_LINES,
  ProfitLineMeta,
} from '../constants/balance-check.constants';
import {
  BalanceAssetsDto,
  BalanceObligationsDto,
  BalanceProfitDto,
} from '../models/balance-check.model';

/**
 * Pure presentation derivations for the trial-balance screen. Kept out of
 * components so they are trivially unit-testable and reused by the PDF
 * export.
 */

export interface BalanceSegment {
  readonly key: BalanceSectionKey;
  readonly label: string;
  readonly value: number;
  readonly tone: BalanceTone;
  /** Width in the composition bar, 0–100. */
  readonly share: number;
}

export interface ProfitLine extends ProfitLineMeta {
  readonly amount: number;
  /** Bar length relative to the largest line, 0–100. */
  readonly weight: number;
}

/**
 * `part` as a percentage of `whole`, clamped to 0–100. Magnitudes are used
 * so a negative line (e.g. a loss) still reads as its share of the side.
 */
export function shareOf(part: number, whole: number): number {
  const w = Math.abs(whole);
  if (!w) return 0;
  return Math.min(100, (Math.abs(part) / w) * 100);
}

function toSegments<K extends BalanceSectionKey>(
  meta: Readonly<Record<K, BalanceSectionMeta>>,
  values: Readonly<Record<K, number>>,
): BalanceSegment[] {
  const keys = Object.keys(meta) as K[];
  const magnitude = keys.reduce((sum, k) => sum + Math.abs(values[k]), 0);
  return keys.map((key) => ({
    key,
    label: meta[key].title,
    tone: meta[key].tone,
    value: values[key],
    share: shareOf(values[key], magnitude),
  }));
}

export function assetSectionTotals(
  a: BalanceAssetsDto,
): Record<AssetSectionKey, number> {
  return {
    treasuries: a.treasuriesTotal,
    receivables: a.receivables.amount,
    inventory: a.inventoryTotal,
    subAccounts: a.subAccountsTotal,
  };
}

export function obligationSectionTotals(
  o: BalanceObligationsDto,
): Record<ObligationSectionKey, number> {
  return {
    capital: o.shareholdersCapitalTotal,
    profit: o.profit.totalProfit,
    suppliers: o.supplierPayablesTotal,
  };
}

export function buildAssetSegments(a: BalanceAssetsDto): BalanceSegment[] {
  return toSegments(ASSET_SECTIONS, assetSectionTotals(a));
}

export function buildObligationSegments(
  o: BalanceObligationsDto,
): BalanceSegment[] {
  return toSegments(OBLIGATION_SECTIONS, obligationSectionTotals(o));
}

export function buildProfitLines(profit: BalanceProfitDto): ProfitLine[] {
  const max = Math.max(0, ...PROFIT_LINES.map((l) => Math.abs(profit[l.key])));
  return PROFIT_LINES.map((line) => ({
    ...line,
    amount: profit[line.key],
    weight: shareOf(profit[line.key], max),
  }));
}

/** Safe average — `0` when there is nothing to divide by. */
export function average(total: number, count: number): number {
  return count > 0 ? total / count : 0;
}
