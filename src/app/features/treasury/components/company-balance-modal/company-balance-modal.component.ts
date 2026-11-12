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
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

import { ModalComponent } from '../../../../shared/components/modal/modal.component';
import { FormErrorComponent } from '../../../../shared/components/form-error/form-error.component';
import { CurrencyArPipe } from '../../../../shared/pipes/currency-ar.pipe';
import { ApiError } from '../../../../core/models/api-response.model';
import { ToastService } from '../../../../core/services/toast.service';
import { apiErrorToMessage } from '../../../../core/utils/api-error.util';

import { ShareholdersService } from '../../services/shareholders.service';
import {
  CompanyBalanceTransaction,
  CompanyBalanceTxType,
} from '../../models/shareholder.model';

/**
 * Deposit to / withdraw from the company's own balance
 * (`POST shareholders/company-balance/transactions`).
 *
 * Withdrawals are deliberately NOT capped: the company balance is allowed to
 * go negative, so the projection only colours a negative result red.
 */
@Component({
  selector: 'app-company-balance-modal',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, ModalComponent, FormErrorComponent, CurrencyArPipe],
  templateUrl: './company-balance-modal.component.html',
})
export class CompanyBalanceModalComponent {
  readonly open = input.required<boolean>();
  readonly type = input<CompanyBalanceTxType>(CompanyBalanceTxType.Deposit);
  /** Current company balance, for the live projection. */
  readonly currentBalance = input<number>(0);

  readonly closed = output<void>();
  readonly saved = output<CompanyBalanceTransaction>();

  private readonly fb = inject(FormBuilder);
  private readonly service = inject(ShareholdersService);
  private readonly toast = inject(ToastService);

  protected readonly submitting = signal(false);
  protected readonly serverError = signal<string | null>(null);
  protected readonly draftAmount = signal(0);

  protected readonly isDeposit = computed(
    () => this.type() === CompanyBalanceTxType.Deposit,
  );
  protected readonly title = computed(() =>
    this.isDeposit() ? 'إيداع لرصيد الشركة' : 'سحب من رصيد الشركة',
  );
  protected readonly projected = computed(
    () =>
      this.currentBalance() +
      (this.isDeposit() ? this.draftAmount() : -this.draftAmount()),
  );

  protected readonly form = this.fb.nonNullable.group({
    amount: [0, [Validators.required, Validators.min(0.01)]],
    date: [this.todayISO(), [Validators.required]],
    notes: [''],
  });

  constructor() {
    effect(
      () => {
        if (!this.open()) return;
        this.type();
        this.submitting.set(false);
        this.serverError.set(null);
        this.draftAmount.set(0);
        this.form.reset({ amount: 0, date: this.todayISO(), notes: '' });
      },
      { allowSignalWrites: true },
    );
  }

  protected onAmountInput(value: string): void {
    this.draftAmount.set(Number(value) || 0);
  }

  protected submit(): void {
    if (this.submitting()) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const raw = this.form.getRawValue();
    this.serverError.set(null);
    this.submitting.set(true);

    this.service
      .createCompanyBalanceTransaction({
        type: this.type(),
        amount: Number(raw.amount) || 0,
        date: raw.date || undefined,
        notes: raw.notes.trim() || undefined,
      })
      .subscribe({
        next: (res) => {
          this.submitting.set(false);
          const voucher = res?.voucherNumber ? ` — سند رقم ${res.voucherNumber}` : '';
          this.toast.success(
            (this.isDeposit()
              ? 'تم الإيداع لرصيد الشركة بنجاح'
              : 'تم السحب من رصيد الشركة بنجاح') + voucher,
          );
          this.saved.emit(res);
        },
        error: (err: ApiError) => {
          this.submitting.set(false);
          this.serverError.set(apiErrorToMessage(err, 'تعذّر تنفيذ العملية'));
        },
      });
  }

  protected close(): void {
    if (this.submitting()) return;
    this.closed.emit();
  }

  private todayISO(): string {
    return new Date().toISOString().slice(0, 10);
  }
}
