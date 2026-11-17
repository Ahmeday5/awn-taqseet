import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';

import { ShareholdersService } from '../../../treasury/services/shareholders.service';
import {
  ConsolidateHistoricalResult,
  ReconcileHistoricalResult,
} from '../../../treasury/models/shareholder.model';
import { CurrencyArPipe } from '../../../../shared/pipes/currency-ar.pipe';
import { DialogService } from '../../../../core/services/dialog.service';
import { ToastService } from '../../../../core/services/toast.service';
import { ApiError } from '../../../../core/models/api-response.model';
import { apiErrorToMessage } from '../../../../core/utils/api-error.util';

/**
 * Admin-only system tools: the one-off historical reconciliation of the
 * company balance and the consolidation of its legacy profit-share rows.
 * Both are idempotent server-side, so a second run simply reports zero
 * changes.
 */
@Component({
  selector: 'app-settings',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe, CurrencyArPipe],
  templateUrl: './settings.component.html',
})
export class SettingsComponent {
  private readonly shareholders = inject(ShareholdersService);
  private readonly dialog = inject(DialogService);
  private readonly toast = inject(ToastService);

  protected readonly running = signal(false);
  protected readonly result = signal<ReconcileHistoricalResult | null>(null);
  protected readonly error = signal<string | null>(null);

  protected readonly consolidating = signal(false);
  protected readonly consolidateResult = signal<ConsolidateHistoricalResult | null>(null);
  protected readonly consolidateError = signal<string | null>(null);

  protected async runReconcile(): Promise<void> {
    if (this.running()) return;
    const ok = await this.dialog.confirm({
      title: 'تسوية رصيد الشركة التاريخي',
      message:
        'سيتم عكس السندات التاريخية القديمة وإرجاع مبالغها إلى الخزائن الأصلية. هذه خطوة لمرة واحدة، وتشغيلها مرة أخرى لا يغيّر شيئًا. هل تريد المتابعة؟',
      confirmText: 'تنفيذ التسوية',
      cancelText: 'إلغاء',
      type: 'danger',
    });
    if (!ok) return;

    this.running.set(true);
    this.error.set(null);
    this.shareholders.reconcileHistoricalCompanyBalance().subscribe({
      next: (res) => {
        this.running.set(false);
        this.result.set(res);
        this.toast.success('تمت التسوية بنجاح');
      },
      error: (err: ApiError) => {
        this.running.set(false);
        const msg = apiErrorToMessage(err, 'تعذّر تنفيذ التسوية');
        this.error.set(msg);
        this.toast.error(msg);
      },
    });
  }

  protected async runConsolidate(): Promise<void> {
    if (this.consolidating()) return;
    const ok = await this.dialog.confirm({
      title: 'تجميع سندات أرباح الشركة القديمة',
      message:
        'سيتم دمج سطور نصيب الشركة من الأرباح القديمة في سندات مُجمّعة. تشغيلها مرة أخرى آمن ولا يغيّر شيئًا. هل تريد المتابعة؟',
      confirmText: 'تنفيذ التجميع',
      cancelText: 'إلغاء',
      type: 'warning',
    });
    if (!ok) return;

    this.consolidating.set(true);
    this.consolidateError.set(null);
    this.shareholders.consolidateHistoricalCompanyBalance().subscribe({
      next: (res) => {
        this.consolidating.set(false);
        this.consolidateResult.set(res);
        this.toast.success('تم تجميع السندات القديمة بنجاح');
      },
      error: (err: ApiError) => {
        this.consolidating.set(false);
        const msg = apiErrorToMessage(err, 'تعذّر تجميع السندات القديمة');
        this.consolidateError.set(msg);
        this.toast.error(msg);
      },
    });
  }
}
