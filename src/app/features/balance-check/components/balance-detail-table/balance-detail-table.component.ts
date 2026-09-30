import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  signal,
} from '@angular/core';
import { BadgeComponent } from '../../../../shared/components/badge/badge.component';
import {
  MoneyArPipe,
  NumberArPipe,
} from '../../../../shared/pipes/money-ar.pipe';
import { normalizeArabic } from '../../../../shared/utils/arabic-search.util';
import {
  DetailColumn,
  DetailSort,
  DetailTableConfig,
} from './balance-detail-table.models';

const collator = new Intl.Collator('ar', { numeric: true, sensitivity: 'base' });

/**
 * Client-side explorer for a section's line items: search, zero-row
 * toggle, column sort and a footer that totals only what is visible
 * ("إجمالي المعروض"), so the footer always matches the rows on screen.
 *
 * Data sets here are small (tens of rows, all already loaded), so
 * everything is derived with signals — no server round-trips.
 */
@Component({
  selector: 'app-balance-detail-table',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BadgeComponent, MoneyArPipe, NumberArPipe],
  templateUrl: './balance-detail-table.component.html',
  styleUrl: './balance-detail-table.component.scss',
})
export class BalanceDetailTableComponent<T> {
  readonly rows = input.required<ReadonlyArray<T>>();
  readonly config = input.required<DetailTableConfig<T>>();

  protected readonly query = signal('');
  protected readonly hideZero = signal(false);
  /** User's explicit choice; `null` falls back to the config default. */
  private readonly sortOverride = signal<DetailSort | null>(null);
  protected readonly sort = computed(
    () => this.sortOverride() ?? this.config().defaultSort ?? null,
  );

  protected readonly hasQuery = computed(() => this.query().trim().length > 0);

  protected readonly filteredRows = computed(() => {
    const { searchText, zeroAmount } = this.config();
    const term = normalizeArabic(this.query());
    const hideZero = this.hideZero() && !!zeroAmount;

    return this.rows().filter((row) => {
      if (hideZero && zeroAmount!(row) === 0) return false;
      return !term || normalizeArabic(searchText(row)).includes(term);
    });
  });

  protected readonly visibleRows = computed(() => {
    const sort = this.sort();
    const rows = this.filteredRows();
    const column = sort
      ? this.config().columns.find((c) => c.id === sort.columnId)
      : undefined;
    if (!sort || !column) return rows;

    const factor = sort.direction === 'asc' ? 1 : -1;
    return [...rows].sort(
      (a, b) => factor * compare(column.value(a), column.value(b)),
    );
  });

  /** Footer sums keyed by column id — only for `aggregate` columns. */
  protected readonly totals = computed(() => {
    const rows = this.visibleRows();
    const sums: Record<string, number> = {};
    for (const col of this.config().columns) {
      if (!col.aggregate) continue;
      sums[col.id] = rows.reduce((s, r) => s + (Number(col.value(r)) || 0), 0);
    }
    return sums;
  });

  protected readonly hasAggregates = computed(() =>
    this.config().columns.some((c) => c.aggregate),
  );

  protected onSearch(value: string): void {
    this.query.set(value);
  }

  protected clearFilters(): void {
    this.query.set('');
    this.hideZero.set(false);
  }

  protected toggleHideZero(): void {
    this.hideZero.update((v) => !v);
  }

  /** Cycles: descending → ascending → descending … on the same column. */
  protected toggleSort(column: DetailColumn<T>): void {
    if (column.sortable === false) return;
    const current = this.sort();
    const direction =
      current?.columnId === column.id && current.direction === 'desc'
        ? 'asc'
        : 'desc';
    this.sortOverride.set({ columnId: column.id, direction });
  }

  protected ariaSort(column: DetailColumn<T>): string | null {
    if (column.sortable === false) return null;
    const s = this.sort();
    if (s?.columnId !== column.id) return 'none';
    return s.direction === 'asc' ? 'ascending' : 'descending';
  }

  protected isNumeric(column: DetailColumn<T>): boolean {
    return column.format === 'money' || column.format === 'number';
  }

  protected asNumber(value: string | number): number {
    return typeof value === 'number' ? value : Number(value);
  }
}

function compare(a: string | number, b: string | number): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return collator.compare(String(a), String(b));
}
