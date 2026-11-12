import { Pipe, PipeTransform } from '@angular/core';
import { environment } from '../../../environments/environment';

/**
 * Rounded currency. Zero is hidden as "—" unless `showZero` is set; negative
 * values always keep their minus sign (treasury balances may go negative).
 */
@Pipe({ name: 'currencyAr', standalone: true })
export class CurrencyArPipe implements PipeTransform {
  transform(value: number | null | undefined, showZero = false): string {
    if (value === null || value === undefined) return '—';
    if (value === 0 && !showZero) return '—';
    // `|| 0` normalises -0 so tiny negatives never render as "-٠".
    const rounded = Math.round(value) || 0;
    return `${rounded.toLocaleString('ar-SA')} ${environment.currency}`;
  }
}
