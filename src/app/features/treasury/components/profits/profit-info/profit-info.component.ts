import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { ProfitExplanationsStore } from '../profit-explanations.store';

const TIP_WIDTH = 280;
const VIEWPORT_GUTTER = 8;

let nextId = 0;

interface TipContent {
  title: string;
  lines: readonly string[];
}

/**
 * Hover/tap tooltip used across the profits screen. Two modes:
 *
 * - **Explanation** (`field`): an (i) icon showing the backend's
 *   `title` + `formula` for that field. Renders nothing when the backend
 *   sent no explanation for it.
 * - **Breakdown** (`label` + `lines`): the figure itself becomes the
 *   trigger and the bubble lists how it adds up.
 *
 * The bubble is `position: fixed` so the horizontally scrolling tables
 * can't clip it. Hover/focus shows it; a click pins it (for touch screens).
 */
@Component({
  selector: 'app-profit-info',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (content(); as c) {
      <button
        type="button"
        [class]="label() !== null ? 'pi-value' : 'pi-btn'"
        [attr.aria-label]="label() !== null ? null : 'طريقة الحساب: ' + c.title"
        [attr.aria-describedby]="open() ? tipId : null"
        [attr.aria-expanded]="pinned()"
        (mouseenter)="show()"
        (mouseleave)="hideUnlessPinned()"
        (focus)="show()"
        (blur)="hide()"
        (click)="togglePin($event)"
        (keydown.escape)="hide()"
      >{{ label() ?? 'i' }}</button>

      @if (open()) {
        <span
          role="tooltip"
          class="pi-tip"
          [id]="tipId"
          [style.top.px]="pos().top"
          [style.left.px]="pos().left"
          [style.width.px]="width"
        >
          @if (c.title) {
            <strong class="pi-title">{{ c.title }}</strong>
          }
          @for (line of c.lines; track $index) {
            <span class="pi-formula">{{ line }}</span>
          }
        </span>
      }
    } @else if (label() !== null) {
      {{ label() }}
    }
  `,
  styleUrl: './profit-info.component.scss',
  host: {
    '(window:resize)': 'hide()',
    '(document:click)': 'onDocumentClick($event)',
  },
})
export class ProfitInfoComponent {
  /** Explanation field, e.g. `NetProfit` (case-insensitive). */
  readonly field = input<string | null>(null);
  /** Breakdown mode: the figure shown as the trigger. */
  readonly label = input<string | null>(null);
  /** Breakdown mode: bubble lines. */
  readonly lines = input<readonly string[] | null>(null);
  /** Breakdown mode: optional bubble heading. */
  readonly heading = input<string>('');

  private readonly store = inject(ProfitExplanationsStore, { optional: true });
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly tipId = `profit-info-${nextId++}`;
  protected readonly width = TIP_WIDTH;
  protected readonly open = signal(false);
  protected readonly pinned = signal(false);
  protected readonly pos = signal({ top: 0, left: 0 });

  protected readonly content = computed<TipContent | null>(() => {
    const lines = this.lines();
    if (lines?.length) return { title: this.heading(), lines };

    const field = this.field();
    const e = field ? this.store?.get(field) : undefined;
    return e?.formula ? { title: e.title, lines: [e.formula] } : null;
  });

  constructor() {
    // The app scrolls inside nested containers, not the window — listen in
    // the capture phase so any scroll ancestor detaches the fixed bubble.
    const onScroll = (): void => {
      if (this.open()) this.hide();
    };
    document.addEventListener('scroll', onScroll, { capture: true, passive: true });
    inject(DestroyRef).onDestroy(() =>
      document.removeEventListener('scroll', onScroll, { capture: true }),
    );
  }

  protected show(): void {
    const btn = this.host.nativeElement.querySelector('button');
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    const maxLeft = window.innerWidth - TIP_WIDTH - VIEWPORT_GUTTER;
    const left = Math.min(
      Math.max(r.left + r.width / 2 - TIP_WIDTH / 2, VIEWPORT_GUTTER),
      Math.max(maxLeft, VIEWPORT_GUTTER),
    );
    this.pos.set({ top: r.bottom + 6, left });
    this.open.set(true);
  }

  protected hide(): void {
    this.open.set(false);
    this.pinned.set(false);
  }

  protected hideUnlessPinned(): void {
    if (!this.pinned()) this.open.set(false);
  }

  protected togglePin(event: MouseEvent): void {
    // Keep row-click handlers (e.g. month details) from firing.
    event.stopPropagation();
    if (this.pinned()) {
      this.hide();
    } else {
      this.show();
      this.pinned.set(true);
    }
  }

  protected onDocumentClick(event: MouseEvent): void {
    if (this.pinned() && !this.host.nativeElement.contains(event.target as Node)) {
      this.hide();
    }
  }
}
