import { BadgeType } from '../../../shared/components/badge/badge.component';
import {
  CompanyProfitEntry,
  CompanyProfitReferenceType,
  CompanyProfitVoucherType,
} from '../models/company-profit-statement.model';

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
};

const REFERENCE_TYPE_BADGE: Readonly<Record<string, BadgeType>> = {
  ShareholderProfitCapitalization: 'purple',
  ProfitDistribution: 'teal',
};

/** Marks a line that is a treasury transfer, not a voucher. */
export const TRANSFER_BADGE = { text: 'تحويل', type: 'info' as BadgeType } as const;

const TREASURY_PREFIX = 'خزنة: ';
const EMPTY = '—';

export function referenceTypeLabel(type: CompanyProfitReferenceType): string {
  return REFERENCE_TYPE_LABELS[type] ?? type;
}

export function referenceTypeBadge(type: CompanyProfitReferenceType): BadgeType {
  return REFERENCE_TYPE_BADGE[type] ?? 'info';
}

export function isCompanyProfitInflow(type: CompanyProfitVoucherType): boolean {
  return type === 'Receipt';
}

/**
 * Who is on the other side of the line: the counterparty treasury for
 * transfers ("خزنة: …"), the shareholder for vouchers.
 */
export function companyProfitCounterparty(entry: CompanyProfitEntry): string {
  if (entry.source === 'Transfer') {
    return `${TREASURY_PREFIX}${entry.counterpartyTreasuryName || EMPTY}`;
  }
  return entry.shareholderName || EMPTY;
}

/** Display-ready statement line — resolved once per fetch, not per change detection. */
export interface CompanyProfitEntryRow {
  /** `${source}-${id}`: voucher and transfer ids can collide. */
  readonly key: string;
  readonly entry: CompanyProfitEntry;
  readonly inflow: boolean;
  readonly isTransfer: boolean;
  readonly voucherLabel: string;
  readonly voucherBadge: BadgeType;
  readonly referenceLabel: string;
  readonly referenceBadge: BadgeType;
  readonly counterparty: string;
}

export function toCompanyProfitEntryRow(entry: CompanyProfitEntry): CompanyProfitEntryRow {
  return {
    key: `${entry.source}-${entry.id}`,
    entry,
    inflow: isCompanyProfitInflow(entry.voucherType),
    isTransfer: entry.source === 'Transfer',
    voucherLabel: COMPANY_PROFIT_VOUCHER_LABELS[entry.voucherType] ?? entry.voucherType,
    voucherBadge: COMPANY_PROFIT_VOUCHER_BADGE[entry.voucherType] ?? 'info',
    referenceLabel: referenceTypeLabel(entry.referenceType),
    referenceBadge: referenceTypeBadge(entry.referenceType),
    counterparty: companyProfitCounterparty(entry),
  };
}
