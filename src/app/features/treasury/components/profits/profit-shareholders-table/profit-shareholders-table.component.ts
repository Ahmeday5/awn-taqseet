import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { AmountArPipe, PercentArPipe } from '../../../../../shared/pipes/money-ar.pipe';
import { normalizeArabic } from '../../../../../shared/utils/arabic-search.util';
import { ProfitInfoComponent } from '../profit-info/profit-info.component';

export interface ShareholderColumn<T> {
  key: Extract<keyof T, string>;
  label: string;
  kind: 'amount' | 'percent';
  /** Explanation field for the (i) icon — hidden when the backend has none. */
  field?: string;
}

type SortKey<T> = Extract<keyof T, string> | 'shareholderName';

const nameCollator = new Intl.Collator('ar');

/**
 * Per-shareholder breakdown. The list can be long (100+ rows), so it can
 * be searched by name and sorted by any column. The total row always covers
 * every shareholder, not just the filtered ones. Pass `totals` to show the
 * backend's own figures; otherwise amount columns are summed here.
 */
@Component({
  selector: 'app-profit-shareholders-table',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AmountArPipe, PercentArPipe, ProfitInfoComponent],
  templateUrl: './profit-shareholders-table.component.html',
  styleUrl: './profit-shareholders-table.component.scss',
})
export class ProfitShareholdersTableComponent<T extends { shareholderName: string }> {
  readonly rows = input.required<readonly T[]>();
  readonly columns = input.required<readonly ShareholderColumn<T>[]>();
  readonly totals = input<Partial<Record<Extract<keyof T, string>, number>> | null>(null);

  protected readonly query = signal('');
  protected readonly sortKey = signal<SortKey<T> | null>(null);
  protected readonly sortDir = signal<1 | -1>(-1);

  protected readonly visible = computed(() => {
    const q = normalizeArabic(this.query());
    const key = this.sortKey();
    const dir = this.sortDir();

    const list = q
      ? this.rows().filter((r) => normalizeArabic(r.shareholderName ?? '').includes(q))
      : [...this.rows()];

    if (key === 'shareholderName') {
      list.sort((a, b) => dir * nameCollator.compare(a.shareholderName, b.shareholderName));
    } else if (key) {
      list.sort((a, b) => dir * (this.num(a, key) - this.num(b, key)));
    }
    return list;
  });

  protected readonly footer = computed(() => {
    const given = this.totals();
    const out = new Map<string, number>();
    for (const col of this.columns()) {
      const provided = given?.[col.key];
      if (provided != null) {
        out.set(col.key, provided);
      } else if (col.kind === 'amount') {
        out.set(col.key, this.rows().reduce((sum, r) => sum + this.num(r, col.key), 0));
      }
    }
    return out;
  });

  protected sortBy(key: SortKey<T>): void {
    if (this.sortKey() === key) {
      this.sortDir.update((d) => (d === 1 ? -1 : 1));
    } else {
      this.sortKey.set(key);
      // Names read naturally A→Z; figures are most useful largest-first.
      this.sortDir.set(key === 'shareholderName' ? 1 : -1);
    }
  }

  protected ariaSort(key: SortKey<T>): 'ascending' | 'descending' | 'none' {
    if (this.sortKey() !== key) return 'none';
    return this.sortDir() === 1 ? 'ascending' : 'descending';
  }

  protected num(row: T, key: string): number {
    const v = (row as unknown as Record<string, unknown>)[key];
    return typeof v === 'number' ? v : 0;
  }
}
