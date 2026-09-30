import { BadgeType } from '../../../../shared/components/badge/badge.component';

export type DetailCellFormat = 'text' | 'money' | 'number';

export interface DetailBadge {
  readonly label: string;
  readonly type: BadgeType;
}

export interface DetailColumn<T> {
  readonly id: string;
  readonly header: string;
  readonly value: (row: T) => string | number;
  /** Default: `'text'`. Numeric formats are end-aligned and tabular. */
  readonly format?: DetailCellFormat;
  /** Optional pill rendered after the cell text (e.g. treasury type). */
  readonly badge?: (row: T) => DetailBadge | null;
  /** Summed over the visible rows into the footer. Numeric columns only. */
  readonly aggregate?: boolean;
  /** Default: `true`. */
  readonly sortable?: boolean;
}

export type SortDirection = 'asc' | 'desc';

export interface DetailSort {
  readonly columnId: string;
  readonly direction: SortDirection;
}

/**
 * Declarative description of a detail table — one per DTO type, defined
 * once as a constant so the page template stays a thin composition.
 */
export interface DetailTableConfig<T> {
  readonly columns: ReadonlyArray<DetailColumn<T>>;
  readonly trackBy: (row: T) => string | number;
  /** Text the search box matches against (Arabic-normalized). */
  readonly searchText: (row: T) => string;
  readonly searchPlaceholder: string;
  readonly emptyText: string;
  /**
   * When set, enables the "إخفاء الأرصدة الصفرية" toggle; rows whose
   * amount is exactly zero are hidden while it is on.
   */
  readonly zeroAmount?: (row: T) => number;
  readonly defaultSort?: DetailSort;
}
