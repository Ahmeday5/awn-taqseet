import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';

import { ToastService } from '../../../core/services/toast.service';

/**
 * Voucher-number chip for ledgers. Voucher numbers are short sequential
 * strings (`"1543"`), shown verbatim; a click copies the value.
 *
 *   <app-voucher-number [value]="e.voucherNumber" />
 */
@Component({
  selector: 'app-voucher-number',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (value()) {
      <button
        type="button"
        class="vn-chip"
        [title]="value() + ' — اضغط للنسخ'"
        [attr.aria-label]="'رقم السند ' + value() + '، اضغط للنسخ'"
        (click)="copy($event)"
      >
        <span class="vn-text">{{ value() }}</span>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor"
             stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <rect x="9" y="9" width="11" height="11" rx="2" />
          <path d="M5 15V5a2 2 0 0 1 2-2h10" />
        </svg>
      </button>
    } @else {
      <span class="vn-empty">—</span>
    }
  `,
  styles: `
    :host { display: inline-flex; max-width: 100%; }

    .vn-chip {
      appearance: none;
      display: inline-flex;
      align-items: center;
      gap: 5px;
      max-width: 100%;
      padding: 2px 7px;
      border: 1px dashed transparent;
      border-radius: var(--r);
      background: var(--bl-l);
      color: var(--bl);
      font-family: inherit;
      cursor: pointer;

      &:hover,
      &:focus-visible { border-color: var(--bl); }

      svg { flex-shrink: 0; opacity: 0.7; }
    }

    .vn-text {
      direction: ltr;
      unicode-bidi: isolate;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 10.5px;
      font-weight: 600;
      white-space: nowrap;
    }

    .vn-empty { color: var(--txt3); }
  `,
})
export class VoucherNumberComponent {
  readonly value = input<string | null | undefined>(null);

  private readonly toast = inject(ToastService);

  protected copy(event: MouseEvent): void {
    // Rows are often clickable — copying must not trigger them.
    event.stopPropagation();
    const value = this.value();
    if (!value) return;

    const clipboard = navigator.clipboard;
    if (!clipboard?.writeText) {
      this.toast.error('النسخ غير مدعوم في هذا المتصفح');
      return;
    }
    clipboard.writeText(value).then(
      () => this.toast.success('تم نسخ رقم السند'),
      () => this.toast.error('تعذّر النسخ'),
    );
  }
}
