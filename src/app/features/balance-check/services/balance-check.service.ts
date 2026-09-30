import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { ApiService } from '../../../core/services/api.service';
import { API_ENDPOINTS } from '../../../core/constants/api-endpoints.const';
import {
  withCache,
  withCacheBypass,
  withInlineHandling,
} from '../../../core/http/http-context.tokens';
import { BalanceCheckDto } from '../models/balance-check.model';
import { normalizeBalanceCheck } from '../utils/balance-check.normalize';

/** Figures move with every payment/invoice — a minute of staleness is the ceiling. */
const BALANCE_CHECK_TTL_MS = 60 * 1000;

/**
 * Data access for the trial-balance screen.
 *
 * Requests use inline handling (no global loader, no toast): the page owns
 * its skeleton + error panel, so a failure is shown once, in context.
 */
@Injectable({ providedIn: 'root' })
export class BalanceCheckService {
  private readonly api = inject(ApiService);

  balanceCheck(): Observable<BalanceCheckDto> {
    return this.fetch(false);
  }

  /** Bypasses the HTTP cache — backs the explicit "تحديث" button. */
  refreshBalanceCheck(): Observable<BalanceCheckDto> {
    return this.fetch(true);
  }

  private fetch(force: boolean): Observable<BalanceCheckDto> {
    const cached = withCache(
      { ttlMs: BALANCE_CHECK_TTL_MS },
      withInlineHandling(),
    );
    return this.api
      .get<BalanceCheckDto>(API_ENDPOINTS.dashboard.balanceCheck, {
        context: force ? withCacheBypass(cached) : cached,
      })
      .pipe(map(normalizeBalanceCheck));
  }
}
