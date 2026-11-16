import { BadgeType } from '../../../shared/components/badge/badge.component';
import {
  CompanyProfitEntry,
  CompanyProfitReferenceType,
  CompanyProfitVoucherType,
} from '../models/company-profit-statement.model';
import {
  CompanyBalanceTxEditTarget,
  CompanyBalanceTxType,
} from '../models/shareholder.model';

const EMPTY = '—';

export const COMPANY_PROFIT_VOUCHER_LABELS: Readonly<
  Record<CompanyProfitVoucherType, string>
> = {
  Receipt: 'قبض',
  Payment: 'صرف',
};

export const COMPANY_PROFIT_VOUCHER_BADGE: Readonly<
  Record<CompanyProfitVoucherType, BadgeType>
> = {
  Receipt: 'ok',
  Payment: 'bad',
};

const REFERENCE_TYPE_LABELS: Readonly<Record<string, string>> = {
  ShareholderProfitCapitalization: 'ترحيل أرباح مساهم',
  ProfitDistribution: 'توزيع أرباح',
  TransferIn: 'تحويل وارد',
  TransferOut: 'تحويل صادر',
  CompanyCapitalAdjustment: 'تعديل رصيد الشركة',
};

const REFERENCE_TYPE_BADGE: Readonly<Record<string, BadgeType>> = {
  ShareholderProfitCapitalization: 'purple',
  ProfitDistribution: 'teal',
  CompanyCapitalAdjustment: 'warn',
};

/** Manual deposit/withdrawal lines read better as إيداع / سحب than as a generic adjustment. */
const MANUAL_ADJUSTMENT_LABELS: Readonly<Record<CompanyProfitVoucherType, string>> = {
  Receipt: 'إيداع لرصيد الشركة',
  Payment: 'سحب من رصيد الشركة',
};

/**
 * The company's own cut of a booked profit. A `Payment` is the company's
 * share of an expense, or the reversal of an earlier profit.
 */
const PROFIT_SHARE_LABELS: Readonly<Record<CompanyProfitVoucherType, string>> = {
  Receipt: 'نصيب الشركة من الأرباح',
  Payment: 'نصيب الشركة من المصروفات/عكس',
};

const PROFIT_SHARE_BADGE: Readonly<Record<CompanyProfitVoucherType, BadgeType>> = {
  Receipt: 'teal',
  Payment: 'pink',
};

/** Marks a line that is a treasury transfer, not a voucher. */
export const TRANSFER_BADGE = { text: 'تحويل', type: 'info' as BadgeType } as const;

export function isCompanyProfitInflow(type: CompanyProfitVoucherType): boolean {
  return type === 'Receipt';
}

function referenceLabel(entry: CompanyProfitEntry): string {
  if (entry.source === 'ProfitShare') {
    return PROFIT_SHARE_LABELS[entry.voucherType] ?? PROFIT_SHARE_LABELS.Receipt;
  }
  if (entry.referenceType === 'CompanyCapitalAdjustment') {
    return MANUAL_ADJUSTMENT_LABELS[entry.voucherType] ?? REFERENCE_TYPE_LABELS['CompanyCapitalAdjustment'];
  }
  return REFERENCE_TYPE_LABELS[entry.referenceType] ?? entry.referenceType;
}

function referenceBadge(entry: CompanyProfitEntry): BadgeType {
  if (entry.source === 'ProfitShare') {
    return PROFIT_SHARE_BADGE[entry.voucherType] ?? 'teal';
  }
  return REFERENCE_TYPE_BADGE[entry.referenceType as CompanyProfitReferenceType] ?? 'info';
}

/** Display-ready statement line — resolved once per fetch, not per change detection. */
export interface CompanyProfitEntryRow {
  /** `${source}-${id}`: ids from different sources can collide. */
  readonly key: string;
  readonly entry: CompanyProfitEntry;
  readonly inflow: boolean;
  readonly isTransfer: boolean;
  readonly isProfitShare: boolean;
  readonly voucherLabel: string;
  readonly voucherBadge: BadgeType;
  readonly referenceLabel: string;
  readonly referenceBadge: BadgeType;
  readonly shareholder: string;
  /** Legacy movements have no treasury — shown as "—". */
  readonly treasury: string;
  readonly classification: string;
}

export function toCompanyProfitEntryRow(entry: CompanyProfitEntry): CompanyProfitEntryRow {
  return {
    key: `${entry.source}-${entry.id}`,
    entry,
    inflow: isCompanyProfitInflow(entry.voucherType),
    isTransfer: entry.source === 'Transfer',
    isProfitShare: entry.source === 'ProfitShare',
    voucherLabel: COMPANY_PROFIT_VOUCHER_LABELS[entry.voucherType] ?? entry.voucherType,
    voucherBadge: COMPANY_PROFIT_VOUCHER_BADGE[entry.voucherType] ?? 'info',
    referenceLabel: referenceLabel(entry),
    referenceBadge: referenceBadge(entry),
    shareholder: entry.shareholderName || EMPTY,
    treasury: entry.counterpartyTreasuryName || EMPTY,
    classification: entry.capitalClassificationName || EMPTY,
  };
}

/** Maps an editable statement line onto the company-balance form. */
export function toCompanyBalanceEditTarget(entry: CompanyProfitEntry): CompanyBalanceTxEditTarget {
  return {
    id: entry.id,
    voucherNumber: entry.voucherNumber,
    type: isCompanyProfitInflow(entry.voucherType)
      ? CompanyBalanceTxType.Deposit
      : CompanyBalanceTxType.Withdrawal,
    amount: entry.amount,
    date: entry.date,
    treasuryId: entry.counterpartyTreasuryId,
    treasuryName: entry.counterpartyTreasuryName,
    capitalClassificationId: entry.capitalClassificationId,
    notes: entry.notes,
  };
}
