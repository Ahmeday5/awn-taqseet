import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';
import { API_ENDPOINTS } from '../constants/api-endpoints.const';
import {
  withCache,
  withCacheBypass,
  withInlineHandling,
  withTimeout,
} from '../http/http-context.tokens';
import {
  WhatsappSendDocumentRequest,
  WhatsappSendResult,
  WhatsappStatus,
} from '../models/whatsapp.model';

/**
 * The provider applies a 3–12s anti-ban delay before it answers, on top of
 * uploading a multi-MB PDF — well past the global 30s timeout.
 */
const SEND_TIMEOUT_MS = 90_000;
const STATUS_TTL_MS = 60_000;

/**
 * Sends documents over WhatsApp through our backend, which holds the Wavex
 * credentials. Callers own loading state and error display.
 */
@Injectable({ providedIn: 'root' })
export class WhatsappService {
  private readonly api = inject(ApiService);

  sendDocument(req: WhatsappSendDocumentRequest): Observable<WhatsappSendResult> {
    return this.api.post<WhatsappSendResult>(
      API_ENDPOINTS.whatsapp.sendDocument,
      req,
      { context: withTimeout(SEND_TIMEOUT_MS, withInlineHandling()) },
    );
  }

  /** Short-cached so back-to-back sends don't each pay for a status round-trip. */
  status(): Observable<WhatsappStatus> {
    return this.api.get<WhatsappStatus>(API_ENDPOINTS.whatsapp.status, {
      context: withCache({ ttlMs: STATUS_TTL_MS }, withInlineHandling()),
    });
  }

  /** Fresh status — use before acting on a cached non-WORKING answer. */
  refreshStatus(): Observable<WhatsappStatus> {
    return this.api.get<WhatsappStatus>(API_ENDPOINTS.whatsapp.status, {
      context: withCacheBypass(withCache({ ttlMs: STATUS_TTL_MS }, withInlineHandling())),
    });
  }
}
