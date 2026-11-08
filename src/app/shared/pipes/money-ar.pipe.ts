import { Pipe, PipeTransform } from '@angular/core';
import {
  formatAmountAr,
  formatMoneyAr,
  formatNumberAr,
  formatPercentAr,
} from '../utils/number-format.util';

/** Precise currency (2dp, signed, zero shown) — see `formatMoneyAr`. */
@Pipe({ name: 'moneyAr', standalone: true })
export class MoneyArPipe implements PipeTransform {
  transform(value: number | null | undefined): string {
    return formatMoneyAr(value);
  }
}

/** Like `moneyAr` without the currency suffix — for dense money grids. */
@Pipe({ name: 'amountAr', standalone: true })
export class AmountArPipe implements PipeTransform {
  transform(value: number | null | undefined): string {
    return formatAmountAr(value);
  }
}

/** Integer count with Arabic-Indic digits and grouping. */
@Pipe({ name: 'numberAr', standalone: true })
export class NumberArPipe implements PipeTransform {
  transform(value: number | null | undefined): string {
    return formatNumberAr(value);
  }
}

/** A value that is already a percentage (0–100) → `١٢٫٣٪`. */
@Pipe({ name: 'percentAr', standalone: true })
export class PercentArPipe implements PipeTransform {
  transform(value: number | null | undefined): string {
    return formatPercentAr(value);
  }
}
