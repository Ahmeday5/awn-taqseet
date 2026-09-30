import { Pipe, PipeTransform } from '@angular/core';
import {
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
