import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BalanceDetailTableComponent } from './balance-detail-table.component';
import { DetailTableConfig } from './balance-detail-table.models';

interface Row {
  id: number;
  name: string;
  balance: number;
}

const CONFIG: DetailTableConfig<Row> = {
  columns: [
    { id: 'name', header: 'الاسم', value: (r) => r.name },
    { id: 'balance', header: 'الرصيد', value: (r) => r.balance, format: 'money', aggregate: true },
  ],
  trackBy: (r) => r.id,
  searchText: (r) => r.name,
  searchPlaceholder: 'بحث',
  emptyText: 'لا يوجد',
  zeroAmount: (r) => r.balance,
  defaultSort: { columnId: 'balance', direction: 'desc' },
};

const ROWS: Row[] = [
  { id: 1, name: 'أحمد', balance: 100 },
  { id: 2, name: 'محمود', balance: 0 },
  { id: 3, name: 'مكة', balance: 300 },
];

describe('BalanceDetailTableComponent', () => {
  let fixture: ComponentFixture<BalanceDetailTableComponent<Row>>;
  // Protected members are exercised through a loose handle — this is a
  // behavioural test of the derived state, not of the public API.
  let cmp: any;

  beforeEach(() => {
    fixture = TestBed.createComponent<BalanceDetailTableComponent<Row>>(
      BalanceDetailTableComponent,
    );
    fixture.componentRef.setInput('rows', ROWS);
    fixture.componentRef.setInput('config', CONFIG);
    fixture.detectChanges();
    cmp = fixture.componentInstance;
  });

  it('applies the default sort (balance desc)', () => {
    expect(cmp.visibleRows().map((r: Row) => r.id)).toEqual([3, 1, 2]);
  });

  it('toggles sort direction on the same column', () => {
    cmp.toggleSort(CONFIG.columns[1]); // desc → asc
    expect(cmp.visibleRows().map((r: Row) => r.id)).toEqual([2, 1, 3]);
  });

  it('matches Arabic spelling variants when searching', () => {
    cmp.onSearch('احمد');
    expect(cmp.visibleRows().map((r: Row) => r.id)).toEqual([1]);

    cmp.onSearch('مكه');
    expect(cmp.visibleRows().map((r: Row) => r.id)).toEqual([3]);
  });

  it('hides zero rows and totals only the visible rows', () => {
    cmp.toggleHideZero();
    expect(cmp.visibleRows().length).toBe(2);

    cmp.onSearch('مكة');
    expect(cmp.totals()['balance']).toBe(300);
  });
});
