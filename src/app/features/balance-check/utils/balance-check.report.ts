import { PrintConfig } from '../../../core/services/print.service';
import {
  formatMoneyAr,
  formatNumberAr,
} from '../../../shared/utils/number-format.util';
import {
  ASSET_SECTIONS,
  BALANCE_CHECK_COPY,
  OBLIGATION_SECTIONS,
  PROFIT_LINES,
} from '../constants/balance-check.constants';
import { BalanceCheckDto } from '../models/balance-check.model';
import { sectionCaptions } from './balance-check.captions';
import {
  assetSectionTotals,
  obligationSectionTotals,
} from './balance-check.view-model';

export interface BalanceReportRow {
  readonly side: string;
  readonly item: string;
  readonly detail: string;
  readonly amount: number;
}

/**
 * Maps the reconciliation into the shared `PrintService` table format:
 * one row per section (plus the net-profit terms), with the verdict and
 * both side totals in the report header.
 */
export function buildBalanceCheckReport(
  dto: BalanceCheckDto,
): PrintConfig<BalanceReportRow> {
  const captions = sectionCaptions(dto);
  const assetTotals = assetSectionTotals(dto.assets);
  const obligationTotals = obligationSectionTotals(dto.obligations);

  const assetRows: BalanceReportRow[] = (
    Object.keys(ASSET_SECTIONS) as (keyof typeof ASSET_SECTIONS)[]
  ).map((key) => ({
    side: 'الأصول',
    item: ASSET_SECTIONS[key].title,
    detail: captions[key],
    amount: assetTotals[key],
  }));

  const obligationRows: BalanceReportRow[] = (
    Object.keys(OBLIGATION_SECTIONS) as (keyof typeof OBLIGATION_SECTIONS)[]
  ).flatMap((key) => {
    const row: BalanceReportRow = {
      side: 'الالتزامات',
      item: OBLIGATION_SECTIONS[key].title,
      detail: captions[key],
      amount: obligationTotals[key],
    };
    if (key !== 'profit') return [row];

    const terms = PROFIT_LINES.map<BalanceReportRow>((line) => ({
      side: '',
      item: `${line.sign > 0 ? '+' : '−'} ${line.label}`,
      detail: line.hint,
      amount: line.sign * dto.obligations.profit[line.key],
    }));
    return [row, ...terms];
  });

  return {
    title: BALANCE_CHECK_COPY.title,
    subtitle: BALANCE_CHECK_COPY.subtitle,
    showRowCount: false,
    columns: [
      { key: 'side', header: 'الجانب', width: '14%', bold: true },
      { key: 'item', header: 'البند', width: '24%' },
      { key: 'detail', header: 'التفاصيل' },
      {
        key: 'amount',
        header: 'المبلغ',
        align: 'end',
        width: '22%',
        format: (v) => formatMoneyAr(v as number),
      },
    ],
    rows: [...assetRows, ...obligationRows],
    meta: [
      { label: 'الحالة', value: dto.isBalanced ? 'الميزانية متوازنة' : 'يوجد فرق' },
      { label: 'إجمالي الأصول', value: formatMoneyAr(dto.assets.total) },
      { label: 'إجمالي الالتزامات', value: formatMoneyAr(dto.obligations.total) },
      { label: 'الفرق', value: formatMoneyAr(dto.difference) },
      { label: 'عدد العقود المستحقة', value: formatNumberAr(dto.assets.receivables.contractsCount) },
    ],
  };
}
