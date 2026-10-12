import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';

import { ModalComponent } from '../../../../shared/components/modal/modal.component';
import { CurrencyArPipe } from '../../../../shared/pipes/currency-ar.pipe';
import { todayIsoDate } from '../../../../shared/utils/date-iso.util';
import { ApiError } from '../../../../core/models/api-response.model';
import { ToastService } from '../../../../core/services/toast.service';
import { apiErrorToMessage } from '../../../../core/utils/api-error.util';

import { ShareholdersService } from '../../services/shareholders.service';
import {
  ReinvestAllDistributedProfitsPayload,
  ReinvestAllDistributedProfitsResult,
} from '../../models/capital-transaction.model';

const SUCCESS_MESSAGE = 'تم إضافة الأرباح الموزعة إلى رأس مال جميع المساهمين.';
const FALLBACK_ERROR = 'تعذّر إضافة الأرباح الموزعة لرأس مال المساهمين';

/**
 * Books every shareholder's full distributed-profit balance into their
 * capital in one shot. Two steps in one modal: a confirmation form (date +
 * notes), then a read-only summary of what the server booked per shareholder.
 *
 *   <app-reinvest-all-distributed-profits-modal
 *     [open]="reinvestAllOpen()"
 *     (closed)="closeReinvestAll()"
 *     (reinvested)="onReinvestedAll()" />
 *
 * `reinvested` fires as soon as the write succeeds (so the parent can reload)
 * while the modal stays open on the summary until the user closes it.
 */
@Component({
  selector: 'app-reinvest-all-distributed-profits-modal',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, ModalComponent, CurrencyArPipe],
  templateUrl: './reinvest-all-distributed-profits-modal.component.html',
  styleUrl: './reinvest-all-distributed-profits-modal.component.scss',
})
export class ReinvestAllDistributedProfitsModalComponent {
  readonly open = input.required<boolean>();

  readonly closed = output<void>();
  readonly reinvested = output<ReinvestAllDistributedProfitsResult>();

  private readonly fb = inject(FormBuilder);
  private readonly service = inject(ShareholdersService);
  private readonly toast = inject(ToastService);

  protected readonly submitting = signal(false);
  /** Set after a successful write — switches the modal to the summary step. */
  protected readonly result = signal<ReinvestAllDistributedProfitsResult | null>(null);

  protected readonly form = this.fb.nonNullable.group({
    date: [todayIsoDate()],
    notes: [''],
  });

  constructor() {
    effect(() => {
      if (!this.open()) return;
      untracked(() => {
        this.result.set(null);
        this.submitting.set(false);
        this.form.reset({ date: todayIsoDate(), notes: '' });
      });
    });
  }

  protected submit(): void {
    if (this.submitting() || this.result()) return;

    this.submitting.set(true);
    this.service.reinvestAllDistributedProfits(this.toPayload()).subscribe({
      next: (res) => {
        this.submitting.set(false);
        this.result.set({
          totalReinvested: res?.totalReinvested ?? 0,
          lines: res?.lines ?? [],
        });
        this.toast.success(SUCCESS_MESSAGE);
        this.reinvested.emit(res);
      },
      error: (err: ApiError) => {
        this.submitting.set(false);
        this.toast.error(apiErrorToMessage(err, FALLBACK_ERROR));
      },
    });
  }

  protected close(): void {
    if (this.submitting()) return;
    this.closed.emit();
  }

  private toPayload(): ReinvestAllDistributedProfitsPayload {
    const raw = this.form.getRawValue();
    const notes = raw.notes.trim();
    return {
      ...(raw.date ? { date: raw.date } : {}),
      ...(notes ? { notes } : {}),
    };
  }
}
