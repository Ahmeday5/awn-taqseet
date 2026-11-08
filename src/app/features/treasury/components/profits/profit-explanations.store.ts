import { Injectable, computed, signal } from '@angular/core';
import { ProfitExplanation } from '../../models/treasury.model';

const normalize = (field: string): string => field.trim().toLowerCase();

/** `Treasuries.ProfitsTreasury` → `profitstreasury`; plain names pass through. */
const leaf = (field: string): string => {
  const key = normalize(field);
  return key.slice(key.lastIndexOf('.') + 1);
};

/**
 * Page-scoped holder for `data.explanations`. Provided by the profits page so
 * every nested block can look up the formula for the figure it shows
 * without passing the list down through inputs.
 *
 * Matching ignores case (`"NetProfit"` ≡ `netProfit`). A dotted path on
 * either side also matches by its last segment, so the lookup keeps working
 * if the backend later qualifies its field names.
 */
@Injectable()
export class ProfitExplanationsStore {
  private readonly list = signal<readonly ProfitExplanation[]>([]);

  private readonly byField = computed(() => {
    const map = new Map<string, ProfitExplanation>();
    for (const e of this.list()) {
      if (!e?.field || !e.formula) continue;
      map.set(normalize(e.field), e);
      // An exact (full-path) entry always wins over a leaf alias.
      if (!map.has(leaf(e.field))) map.set(leaf(e.field), e);
    }
    return map;
  });

  readonly all = computed(() => this.list().filter((e) => !!e?.formula));

  set(explanations: readonly ProfitExplanation[] | null | undefined): void {
    this.list.set(explanations ?? []);
  }

  /** Reactive when called inside a computed/template. */
  get(field: string): ProfitExplanation | undefined {
    const map = this.byField();
    return map.get(normalize(field)) ?? map.get(leaf(field));
  }
}
