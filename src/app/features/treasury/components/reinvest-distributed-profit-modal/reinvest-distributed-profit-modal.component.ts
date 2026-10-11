import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

import { ModalComponent } from '../../../../shared/components/modal/modal.component';
import { FormErrorComponent } from '../../../../shared/components/form-error/form-error.component';
import { CurrencyArPipe } from '../../../../shared/pipes/currency-ar.pipe';
import { todayIsoDate } from '../../../../shared/utils/date-iso.util';
import { ApiError } from '../../../../core/models/api-response.model';
import { ToastService } from '../../../../core/services/toast.service';
import { apiErrorToMessage } from '../../../../core/utils/api-error.util';

import { ShareholdersService } from '../../services/shareholders.service';
import {
  CapitalTransaction,
  ReinvestDistributedProfitPayload,
} from '../../models/capital-transaction.model';

const MIN_AMOUNT = 0.01;
const SUCCESS_MESSAGE = 'تم إضافة الأرباح الموزعة إلى رأس مال المساهم.';
const FALLBACK_ERROR = 'تعذّر إضافة الأرباح الموزعة إلى رأس المال';

/** Money is exchanged with the API at 2-decimal precision. */
function roundMoney(value: number): number {
  return Math.round((Number(value) || 0) * 100) / 100;
}

/**
 * Books part of a shareholder's already-distributed profit back into their
 * capital. A pure ledger entry — no treasury is involved, so there is no
 * treasury picker.
 *
 *   <app-reinvest-distributed-profit-modal
 *     [open]="reinvestOpen()"
 *     [shareholderId]="sh.id"
 *     [availableBalance]="st.distributedProfitBalance"
 *     [currentCapital]="sh.contributedAmount"
 *     (closed)="closeReinvest()"
 *     (reinvested)="onReinvested()" />
 *
 * The form is re-seeded every time the modal opens: amount defaults to (and is
 * capped at) the available balance, date defaults to today.
 */
@Component({
  selector: 'app-reinvest-distributed-profit-modal',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, ModalComponent, FormErrorComponent, CurrencyArPipe],
  templateUrl: './reinvest-distributed-profit-modal.component.html',
  styleUrl: './reinvest-distributed-profit-modal.component.scss',
})
export class ReinvestDistributedProfitModalComponent {
  // ── inputs ──
  readonly open = input.required<boolean>();
  readonly shareholderId = input<number | null>(null);
  /** Distributed profit still eligible for reinvestment — the amount's upper bound. */
  readonly availableBalance = input<number>(0);
  /** Shareholder's capital before this operation (for the projection panel). */
  readonly currentCapital = input<number>(0);

  // ── outputs ──
  readonly closed = output<void>();
  /** Emitted with the created capital movement after a successful write. */
  readonly reinvested = output<CapitalTransaction>();

  // ── deps ──
  private readonly fb = inject(FormBuilder);
  private readonly service = inject(ShareholdersService);
  private readonly toast = inject(ToastService);

  // ── state ──
  protected readonly submitting = signal(false);

  // ── form ──
  protected readonly form = this.fb.group({
    amount: this.fb.control<number | null>(null, [
      Validators.required,
      Validators.min(MIN_AMOUNT),
    ]),
    date: this.fb.nonNullable.control(todayIsoDate()),
    notes: this.fb.nonNullable.control(''),
  });

  private readonly draftAmount = toSignal(this.form.controls.amount.valueChanges, {
    initialValue: null,
  });

  // ── derived ──
  protected readonly maxAmount = computed(() => roundMoney(this.availableBalance()));

  protected readonly amount = computed(() => roundMoney(this.draftAmount() ?? 0));

  protected readonly remainingBalance = computed(() =>
    Math.max(0, roundMoney(this.maxAmount() - this.amount())),
  );

  protected readonly projectedCapital = computed(
    () => this.currentCapital() + this.amount(),
  );

  protected readonly hasBalance = computed(() => this.maxAmount() > 0);

  constructor() {
    effect(() => {
      if (!this.open()) return;
      untracked(() => this.resetForm());
    });
  }

  // ─────────── template handlers ───────────

  protected useFullBalance(): void {
    this.form.controls.amount.setValue(this.maxAmount());
    this.form.controls.amount.markAsDirty();
  }

  protected submit(): void {
    if (this.submitting()) return;
    const shareholderId = this.shareholderId();
    if (shareholderId == null) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.submitting.set(true);
    this.service
      .reinvestDistributedProfit(shareholderId, this.toPayload())
      .subscribe({
        next: (tx) => {
          this.submitting.set(false);
          this.toast.success(SUCCESS_MESSAGE);
          this.reinvested.emit(tx);
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

  protected isInvalid(field: keyof typeof this.form.controls): boolean {
    const ctrl = this.form.controls[field];
    return ctrl.invalid && (ctrl.dirty || ctrl.touched);
  }

  // ─────────── internals ───────────

  private resetForm(): void {
    const max = this.maxAmount();
    const amount = this.form.controls.amount;
    amount.setValidators([
      Validators.required,
      Validators.min(MIN_AMOUNT),
      Validators.max(max),
    ]);
    this.form.reset({
      amount: max > 0 ? max : null,
      date: todayIsoDate(),
      notes: '',
    });
    this.submitting.set(false);
  }

  private toPayload(): ReinvestDistributedProfitPayload {
    const raw = this.form.getRawValue();
    const notes = raw.notes.trim();
    return {
      amount: roundMoney(raw.amount ?? 0),
      ...(raw.date ? { date: raw.date } : {}),
      ...(notes ? { notes } : {}),
    };
  }
}
