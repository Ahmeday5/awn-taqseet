import { formatNumberAr } from '../../../shared/utils/number-format.util';
import { BalanceSectionKey } from '../constants/balance-check.constants';
import { BalanceCheckDto } from '../models/balance-check.model';

/** Short "how many" line under each section title, e.g. "١٧ خزنة". */
export function sectionCaptions(
  dto: BalanceCheckDto,
): Record<BalanceSectionKey, string> {
  const { assets, obligations } = dto;
  const units = assets.warehouses.reduce((s, w) => s + w.quantity, 0);
  const openInvoices = obligations.suppliers.reduce(
    (s, x) => s + x.invoicesCount,
    0,
  );
  const n = formatNumberAr;

  return {
    treasuries: `${n(assets.treasuries.length)} خزنة`,
    receivables: `${n(assets.receivables.contractsCount)} عقد · ${n(assets.receivables.installmentsCount)} قسط`,
    inventory: `${n(assets.warehouses.length)} مخزن · ${n(units)} قطعة`,
    subAccounts: `${n(assets.subAccounts.length)} حساب`,
    capital: `${n(obligations.shareholders.length)} شريك`,
    profit: 'صافي بعد الخصومات',
    suppliers: `${n(obligations.suppliers.length)} مورد · ${n(openInvoices)} فاتورة مفتوحة`,
  };
}
