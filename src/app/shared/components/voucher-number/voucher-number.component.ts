import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';

import { ToastService } from '../../../core/services/toast.service';

const DEFAULT_HEAD = 6;
const DEFAULT_TAIL = 6;
const ELLIPSIS = '…';

/**
 * Shortens a long voucher number by eliding its middle, keeping both the
 * type prefix and the unique tail readable (`RCP-20…000123`). Values short
 * enough to fit are returned unchanged.
 */
export function shortenVoucherNumber(
  value: string | null | undefined,
  head = DEFAULT_HEAD,
  tail = DEFAULT_TAIL,
): string {
  if (!value) return '';
  return value.length > head + tail + ELLIPSIS.length
    ? `${value.slice(0, head)}${ELLIPSIS}${value.slice(-tail)}`
    : value;
}

/**
 * Compact voucher-number chip for dense ledgers.
 *
 * Shows a shortened number; hovering reveals the full value and a click
 * copies it, so the long number never widens the table yet stays one click
 * away.
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
        <span class="vn-text">{{ short() }}</span>
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
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .vn-empty { color: var(--txt3); }
  `,
})
export class VoucherNumberComponent {
  readonly value = input<string | null | undefined>(null);
  /** Characters kept from the start of the number. */
  readonly head = input(DEFAULT_HEAD);
  /** Characters kept from the end of the number (the unique part). */
  readonly tail = input(DEFAULT_TAIL);

  private readonly toast = inject(ToastService);

  protected readonly short = computed(() =>
    shortenVoucherNumber(this.value(), this.head(), this.tail()),
  );

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
