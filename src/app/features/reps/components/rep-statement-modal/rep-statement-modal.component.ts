import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { ModalComponent } from '../../../../shared/components/modal/modal.component';
import { RepStatementViewComponent } from '../rep-statement-view/rep-statement-view.component';
import { RepsService } from '../../services/reps.service';
import {
  RepresentativeStatement,
  RepStatementContractRow,
} from '../../models/rep.model';
import { CommonModule } from '@angular/common';
import { Observable, firstValueFrom } from 'rxjs';
import { map } from 'rxjs/operators';
import { PrintConfig, PrintService } from '../../../../core/services/print.service';
import { WhatsappSendButtonComponent } from '../../../../shared/components/whatsapp-send-button/whatsapp-send-button.component';
import { formatMoneyAr } from '../../../../shared/utils/number-format.util';
import { PdfExportService } from '../../../../core/services/pdf-export.service';
import { reportFromPrintConfig } from '../../../../core/pdf/pdf-report.template';
import { formatPrintCurrency } from '../../../../core/utils/print-format.util';
import { fetchAllPages } from '../../../../core/utils/api-list.util';
import { REP_STATUS_LABELS } from '../../constants/rep-meta';

/**
 * Admin-facing wrapper that loads a specific representative's account
 * statement (`representatives/{id}/statement`) and renders it through the
 * shared {@link RepStatementViewComponent}. Paging is owned here so the
 * presentational view stays a pure projection.
 */
@Component({
  selector: 'app-rep-statement-modal',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ModalComponent, RepStatementViewComponent, CommonModule, WhatsappSendButtonComponent],
  template: `
    <app-modal
      [open]="open()"
      [title]="'كشف حساب المندوب' + (representativeName() ? ' — ' + representativeName() : '')"
      size="xl"
      (closed)="closed.emit()"
    >
      <app-rep-statement-view
        [statement]="statement()"
        [loading]="loading()"
        [pageIndex]="pageIndex()"
        [pageSize]="pageSize()"
        [search]="search()"
        (pageChange)="pageIndex.set($event)"
        (pageSizeChange)="onPageSize($event)"
        (searchChange)="onSearch($event)"
      />

      <ng-container modal-footer>
        <button type="button" class="btn" (click)="closed.emit()">إغلاق</button>
        <button
          type="button"
          class="btn btn-bl d-inline-flex align-items-center gap-1"
          [disabled]="!statement() || loading() || isPrinting()"
          (click)="printStatement()"
          title="طباعة"
        >
          @if (isPrinting()) {
            <span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
          }
          <span>🖨 طباعة PDF</span>
        </button>
        @if (statement(); as snap) {
          <app-whatsapp-send-button
            documentType="RepStatement"
            [documentId]="snap.representative.id"
            [recipientName]="snap.representative.fullName"
            [phone]="snap.representative.phoneNumber"
            [fileName]="'كشف-حساب-' + snap.representative.fullName"
            [caption]="whatsappCaption()"
            [pdf]="buildStatementPdf"
            [small]="false"
            [disabled]="loading()"
          />
        }
      </ng-container>
    </app-modal>
  `,
})
export class RepStatementModalComponent {
  private readonly service = inject(RepsService);
  private readonly printer = inject(PrintService);
  private readonly pdf = inject(PdfExportService);

  readonly open = input.required<boolean>();
  readonly representativeId = input<number | null>(null);
  readonly representativeName = input<string>('');

  readonly closed = output<void>();

  protected readonly statement = signal<RepresentativeStatement | null>(null);
  protected readonly loading = signal(false);
  protected readonly pageIndex = signal(1);
  protected readonly pageSize = signal(10);
  protected readonly search = signal('');
  protected readonly isPrinting = signal(false);

  private debounce: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    // Reset paging + search whenever a different representative is opened.
    effect(
      () => {
        this.representativeId();
        this.pageIndex.set(1);
        this.search.set('');
        this.statement.set(null);
      },
      { allowSignalWrites: true },
    );

    // Fetch on open + whenever the page/size/search/representative changes.
    effect(
      () => {
        const id = this.representativeId();
        const pageIndex = this.pageIndex();
        const pageSize = this.pageSize();
        const search = this.search().trim();
        if (!this.open() || id == null) return;

        this.loading.set(true);
        if (this.debounce) clearTimeout(this.debounce);
        this.debounce = setTimeout(() => {
          this.service.statement(id, { pageIndex, pageSize, search }).subscribe({
            next: (res) => {
              this.statement.set(res);
              this.loading.set(false);
            },
            error: () => {
              this.statement.set(null);
              this.loading.set(false);
            },
          });
        }, 300);
      },
      { allowSignalWrites: true },
    );
  }

  protected onPageSize(size: number): void {
    this.pageSize.set(size);
    this.pageIndex.set(1);
  }

  protected onSearch(value: string): void {
    this.search.set(value);
    if (this.pageIndex() !== 1) this.pageIndex.set(1);
  }

  /**
   * Exports the full statement (not just the current page) as PDF via the
   * unified {@link PrintService}. We fetch every contract row from the server
   * so the printed document is consistent regardless of the active page size.
   */
  protected printStatement(): void {
    const id = this.representativeId();
    if (id == null || this.isPrinting()) return;
    this.isPrinting.set(true);

    this.loadPrintConfig(id).subscribe({
      next: (config) => {
        this.printer.print(config);
        this.isPrinting.set(false);
      },
      error: () => this.isPrinting.set(false),
    });
  }

  // ─────────── whatsapp ───────────

  protected readonly whatsappCaption = computed(() => {
    const snap = this.statement();
    if (!snap) return '';
    const sum = snap.summary;
    return [
      `كشف حساب المندوب: ${snap.representative.fullName}`,
      `عدد العقود: ${sum.contractsCount}`,
      `إجمالي المبيعات: ${formatMoneyAr(sum.totalSales)}`,
      `إجمالي العمولة: ${formatMoneyAr(sum.totalCommission)}`,
      `العمولة المستحقة: ${formatMoneyAr(sum.outstandingCommission)}`,
    ].join('\n');
  });

  /** Same report as the printout (every page), as a PDF file for WhatsApp. */
  protected readonly buildStatementPdf = async (): Promise<string> => {
    const id = this.representativeId();
    if (id == null) throw new Error('No representative selected');
    const config = await firstValueFrom(this.loadPrintConfig(id));
    const sum = this.statement()?.summary;
    return this.pdf.renderReport(reportFromPrintConfig(config, {
      caption: `العقود (${config.rows.length.toLocaleString('ar-EG')})`,
      metrics: sum
        ? [
            { label: 'إجمالي المبيعات', value: formatPrintCurrency(sum.totalSales), emphasis: true },
            { label: 'إجمالي الربح', value: formatPrintCurrency(sum.totalProfit), tone: 'positive' },
            { label: 'إجمالي العمولة', value: formatPrintCurrency(sum.totalCommission), tone: 'accent' },
            { label: 'العمولة المصروفة', value: formatPrintCurrency(sum.paidCommission) },
            { label: 'العمولة المستحقة', value: formatPrintCurrency(sum.outstandingCommission), tone: sum.outstandingCommission > 0 ? 'negative' : 'positive' },
          ]
        : undefined,
    }));
  };

  private loadPrintConfig(id: number): Observable<PrintConfig<RepStatementContractRow>> {
    // The statement endpoint wraps the contract rows inside a PagedResponse
    // field (`data.contracts`), so we adapt it to fetchAllPages' shape.
    return fetchAllPages<RepStatementContractRow>((pageIndex, pageSize) =>
      this.service
        .statement(id, { pageIndex, pageSize })
        .pipe(map((res) => res.contracts)),
    ).pipe(map((rows) => this.buildPrintConfig(rows)));
  }

  private buildPrintConfig(rows: RepStatementContractRow[]): PrintConfig<RepStatementContractRow> {
    const snap = this.statement();
    const rep = snap?.representative;
    const sum = snap?.summary;

    const meta: Array<{ label: string; value: string }> = [];
    if (rep) {
      meta.push({ label: 'المندوب', value: rep.fullName });
      if (rep.phoneNumber) meta.push({ label: 'الهاتف', value: rep.phoneNumber });
      meta.push({ label: 'نسبة الربح', value: `${rep.profitRatePercent}%` });
    }
    if (sum?.firstContractDate && sum?.lastContractDate) {
      meta.push({
        label: 'الفترة',
        value: `${this.fmtDate(sum.firstContractDate)} → ${this.fmtDate(sum.lastContractDate)}`,
      });
    }

    return {
      title: 'كشف حساب المندوب',
      subtitle: rep ? rep.fullName : undefined,
      meta,
      orientation: 'landscape',
      columns: [
        { key: 'contractId',   header: 'العقد',     align: 'center', width: '52px', format: (v) => `#${v}` },
        { key: 'clientName',   header: 'العميل',    align: 'start',  bold: true },
        { key: 'productName',  header: 'المنتج',    align: 'start' },
        { key: 'quantity',     header: 'الكمية',    align: 'center', format: 'number' },
        { key: 'cashPrice',    header: 'سعر النقد', align: 'end',    format: 'currency' },
        { key: 'saleAmount',   header: 'سعر البيع', align: 'end',    format: 'currency', bold: true },
        { key: 'cost',         header: 'التكلفة',  align: 'end',    format: 'currency' },
        { key: 'profit',       header: 'الربح',    align: 'end',    format: 'currency', bold: true },
        { key: 'commission',   header: 'العمولة',  align: 'end',    format: 'currency' },
        {
          key: 'status',
          header: 'الحالة',
          align: 'center',
          format: (v) =>
            REP_STATUS_LABELS[v as keyof typeof REP_STATUS_LABELS] ?? String(v),
        },
        { key: 'dateOfSale', header: 'تاريخ البيع', align: 'center', format: 'shortDate' },
      ],
      totals: sum
        ? {
            label: 'الإجمالي',
            labelColSpan: 5,
            cells: [
              null,
              this.fmtCurrency(sum.totalSales),
              this.fmtCurrency(sum.totalCost),
              this.fmtCurrency(sum.totalProfit),
              this.fmtCurrency(sum.totalCommission),
              null,
              null,
            ],
          }
        : undefined,
      rows,
    };
  }

  private fmtCurrency(value: number): string {
    return `${Math.round(value ?? 0).toLocaleString('ar-EG')} ج.م`;
  }

  private fmtDate(iso: string): string {
    const d = new Date(iso);
    return isNaN(d.getTime())
      ? '—'
      : `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
  }
}
