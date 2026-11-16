import { formatNumberAr } from '../../../shared/utils/number-format.util';
import { BalanceSectionKey } from '../constants/balance-check.constants';
import {
  BalanceCheckDto,
  isCompanyShareholderLine,
} from '../models/balance-check.model';

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
  // The company line is listed with the partners but is not one of them.
  const partners = obligations.shareholders.filter((s) => !isCompanyShareholderLine(s)).length;
  const hasCompany = obligations.shareholders.some(isCompanyShareholderLine);

  return {
    treasuries: `${n(assets.treasuries.length)} خزنة`,
    receivables: `${n(assets.receivables.contractsCount)} عقد · ${n(assets.receivables.installmentsCount)} قسط`,
    inventory: `${n(assets.warehouses.length)} مخزن · ${n(units)} قطعة`,
    subAccounts: `${n(assets.subAccounts.length)} حساب`,
    capital: `${n(partners)} شريك${hasCompany ? ' + رصيد الشركة' : ''}`,
    profit: 'صافي بعد الخصومات',
    suppliers: `${n(obligations.suppliers.length)} مورد · ${n(openInvoices)} فاتورة مفتوحة`,
  };
}
