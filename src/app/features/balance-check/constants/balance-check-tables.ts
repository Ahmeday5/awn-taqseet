import { BadgeType } from '../../../shared/components/badge/badge.component';
import {
  TREASURY_TYPE_BADGE,
  TREASURY_TYPE_LABELS,
} from '../../treasury/constants/treasury-type-labels';
import { TreasuryType } from '../../treasury/enums/treasury-type.enum';
import { DetailTableConfig } from '../components/balance-detail-table/balance-detail-table.models';
import {
  BalanceShareholderDto,
  BalanceSubAccountDto,
  BalanceSupplierDto,
  BalanceTreasuryDto,
  BalanceWarehouseDto,
} from '../models/balance-check.model';

function treasuryBadge(type: string): { label: string; type: BadgeType } {
  const known = type as TreasuryType;
  return {
    label: TREASURY_TYPE_LABELS[known] ?? type,
    type: TREASURY_TYPE_BADGE[known] ?? 'info',
  };
}

export const TREASURIES_TABLE: DetailTableConfig<BalanceTreasuryDto> = {
  columns: [
    {
      id: 'name',
      header: 'الخزنة',
      value: (r) => r.name,
      badge: (r) => treasuryBadge(r.type),
    },
    {
      id: 'balance',
      header: 'الرصيد',
      value: (r) => r.balance,
      format: 'money',
      aggregate: true,
    },
  ],
  trackBy: (r) => r.id,
  searchText: (r) => `${r.name} ${treasuryBadge(r.type).label}`,
  searchPlaceholder: 'ابحث باسم الخزنة...',
  emptyText: 'لا توجد خزائن.',
  zeroAmount: (r) => r.balance,
  defaultSort: { columnId: 'balance', direction: 'desc' },
};

export const WAREHOUSES_TABLE: DetailTableConfig<BalanceWarehouseDto> = {
  columns: [
    { id: 'name', header: 'المخزن', value: (r) => r.name },
    {
      id: 'quantity',
      header: 'الكمية',
      value: (r) => r.quantity,
      format: 'number',
      aggregate: true,
    },
    {
      id: 'value',
      header: 'القيمة',
      value: (r) => r.value,
      format: 'money',
      aggregate: true,
    },
  ],
  trackBy: (r) => r.id,
  searchText: (r) => r.name,
  searchPlaceholder: 'ابحث باسم المخزن...',
  emptyText: 'لا توجد مخازن.',
  zeroAmount: (r) => r.value,
  defaultSort: { columnId: 'value', direction: 'desc' },
};

export const SUB_ACCOUNTS_TABLE: DetailTableConfig<BalanceSubAccountDto> = {
  columns: [
    { id: 'name', header: 'الحساب', value: (r) => r.name },
    {
      id: 'balance',
      header: 'الرصيد',
      value: (r) => r.balance,
      format: 'money',
      aggregate: true,
    },
  ],
  trackBy: (r) => r.id,
  searchText: (r) => r.name,
  searchPlaceholder: 'ابحث باسم الحساب...',
  emptyText: 'لا توجد حسابات فرعية.',
  zeroAmount: (r) => r.balance,
  defaultSort: { columnId: 'balance', direction: 'desc' },
};

export const SHAREHOLDERS_TABLE: DetailTableConfig<BalanceShareholderDto> = {
  columns: [
    { id: 'name', header: 'الشريك', value: (r) => r.name },
    {
      id: 'contributedAmount',
      header: 'المساهمة',
      value: (r) => r.contributedAmount,
      format: 'money',
      aggregate: true,
    },
  ],
  trackBy: (r) => r.id,
  searchText: (r) => r.name,
  searchPlaceholder: 'ابحث باسم الشريك...',
  emptyText: 'لا يوجد شركاء.',
  defaultSort: { columnId: 'contributedAmount', direction: 'desc' },
};

export const SUPPLIERS_TABLE: DetailTableConfig<BalanceSupplierDto> = {
  columns: [
    { id: 'name', header: 'المورد', value: (r) => r.name },
    {
      id: 'invoicesCount',
      header: 'فواتير مفتوحة',
      value: (r) => r.invoicesCount,
      format: 'number',
      aggregate: true,
    },
    {
      id: 'outstanding',
      header: 'المتبقي',
      value: (r) => r.outstanding,
      format: 'money',
      aggregate: true,
    },
  ],
  trackBy: (r) => r.id,
  searchText: (r) => r.name,
  searchPlaceholder: 'ابحث باسم المورد...',
  emptyText: 'لا توجد مستحقات للموردين.',
  zeroAmount: (r) => r.outstanding,
  defaultSort: { columnId: 'outstanding', direction: 'desc' },
};
