import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Observable, Subject, catchError, map, of, switchMap, tap } from 'rxjs';
import { ApiError } from '../../../../core/models/api-response.model';
import { PrintService } from '../../../../core/services/print.service';
import { apiErrorToMessage } from '../../../../core/utils/api-error.util';
import { formatTimeAr } from '../../../../shared/utils/number-format.util';
import { BalanceDetailTableComponent } from '../../components/balance-detail-table/balance-detail-table.component';
import { BalancePanelComponent } from '../../components/balance-panel/balance-panel.component';
import { BalanceSectionComponent } from '../../components/balance-section/balance-section.component';
import { BalanceStatusCardComponent } from '../../components/balance-status-card/balance-status-card.component';
import { ProfitBreakdownComponent } from '../../components/profit-breakdown/profit-breakdown.component';
import { ReceivablesSummaryComponent } from '../../components/receivables-summary/receivables-summary.component';
import {
  SHAREHOLDERS_TABLE,
  SUB_ACCOUNTS_TABLE,
  SUPPLIERS_TABLE,
  TREASURIES_TABLE,
  WAREHOUSES_TABLE,
} from '../../constants/balance-check-tables';
import {
  ASSET_SECTIONS,
  BALANCE_CHECK_COPY,
  OBLIGATION_SECTIONS,
} from '../../constants/balance-check.constants';
import { BalanceCheckDto } from '../../models/balance-check.model';
import { BalanceCheckService } from '../../services/balance-check.service';
import { sectionCaptions } from '../../utils/balance-check.captions';
import { buildBalanceCheckReport } from '../../utils/balance-check.report';
import {
  buildAssetSegments,
  buildObligationSegments,
  shareOf,
} from '../../utils/balance-check.view-model';

type LoadResult =
  | { readonly ok: true; readonly data: BalanceCheckDto }
  | { readonly ok: false; readonly error: ApiError };

/**
 * ميزان المراجعة — reconciles company assets against obligations.
 *
 * Loading goes through a single `switchMap` pipeline, so rapid refresh
 * clicks cancel the in-flight request instead of racing it. Stale data
 * stays on screen during a refresh; the skeleton only shows on first load.
 */
@Component({
  selector: 'app-balance-check',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    BalanceStatusCardComponent,
    BalancePanelComponent,
    BalanceSectionComponent,
    BalanceDetailTableComponent,
    ProfitBreakdownComponent,
    ReceivablesSummaryComponent,
  ],
  templateUrl: './balance-check.component.html',
  styleUrl: './balance-check.component.scss',
})
export class BalanceCheckComponent implements OnInit {
  private readonly service = inject(BalanceCheckService);
  private readonly print = inject(PrintService);

  protected readonly copy = BALANCE_CHECK_COPY;
  protected readonly assetMeta = ASSET_SECTIONS;
  protected readonly obligationMeta = OBLIGATION_SECTIONS;
  protected readonly tables = {
    treasuries: TREASURIES_TABLE,
    warehouses: WAREHOUSES_TABLE,
    subAccounts: SUB_ACCOUNTS_TABLE,
    shareholders: SHAREHOLDERS_TABLE,
    suppliers: SUPPLIERS_TABLE,
  } as const;

  // ── state ──
  protected readonly data = signal<BalanceCheckDto | null>(null);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly forbidden = signal(false);
  private readonly lastUpdated = signal<Date | null>(null);

  // ── derived ──
  protected readonly isFirstLoad = computed(
    () => this.loading() && !this.data(),
  );
  protected readonly lastUpdatedLabel = computed(() => {
    const at = this.lastUpdated();
    return at ? formatTimeAr(at) : null;
  });
  protected readonly captions = computed(() => {
    const d = this.data();
    return d ? sectionCaptions(d) : null;
  });
  protected readonly assetSegments = computed(() => {
    const d = this.data();
    return d ? buildAssetSegments(d.assets) : [];
  });
  protected readonly obligationSegments = computed(() => {
    const d = this.data();
    return d ? buildObligationSegments(d.obligations) : [];
  });

  private readonly load$ = new Subject<{ force: boolean }>();

  constructor() {
    this.load$
      .pipe(
        tap(() => {
          this.loading.set(true);
          this.error.set(null);
        }),
        switchMap(({ force }) => this.request(force)),
        takeUntilDestroyed(),
      )
      .subscribe((result) => this.applyResult(result));
  }

  ngOnInit(): void {
    this.load$.next({ force: false });
  }

  protected refresh(): void {
    this.load$.next({ force: true });
  }

  protected exportPdf(): void {
    const d = this.data();
    if (d) this.print.print(buildBalanceCheckReport(d));
  }

  /** Section share of its side's total — drives the header meter. */
  protected share(part: number, whole: number): number {
    return shareOf(part, whole);
  }

  // ─────────── internals ───────────

  private request(force: boolean): Observable<LoadResult> {
    const source$ = force
      ? this.service.refreshBalanceCheck()
      : this.service.balanceCheck();
    return source$.pipe(
      map((data): LoadResult => ({ ok: true, data })),
      catchError((error: ApiError) => of<LoadResult>({ ok: false, error })),
    );
  }

  private applyResult(result: LoadResult): void {
    this.loading.set(false);

    if (result.ok) {
      this.data.set(result.data);
      this.forbidden.set(false);
      this.lastUpdated.set(new Date());
      return;
    }

    const isForbidden = result.error?.status === 403;
    this.forbidden.set(isForbidden);
    this.error.set(
      isForbidden
        ? this.copy.forbidden
        : apiErrorToMessage(result.error, this.copy.loadError),
    );
    // A 403 means the figures must not stay visible.
    if (isForbidden) this.data.set(null);
  }
}
