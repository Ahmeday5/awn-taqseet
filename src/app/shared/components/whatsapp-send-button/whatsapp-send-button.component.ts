import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  Injector,
  input,
  signal,
} from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { containsArabic } from '../../../core/constants/api-messages.const';
import { ApiError } from '../../../core/models/api-response.model';
import {
  WHATSAPP_DOCUMENT_LABEL,
  WHATSAPP_STATUS_BLOCKED_MESSAGE,
  WhatsappDocumentType,
} from '../../../core/models/whatsapp.model';
import { DialogService } from '../../../core/services/dialog.service';
import { PdfTooLargeError } from '../../../core/services/pdf-export.service';
import { ToastService } from '../../../core/services/toast.service';
import { WhatsappService } from '../../../core/services/whatsapp.service';
import { apiErrorToMessage } from '../../../core/utils/api-error.util';

type Stage = 'idle' | 'checking' | 'building' | 'sending';

const STAGE_LABEL: Record<Exclude<Stage, 'idle'>, string> = {
  checking: 'جاري التحقق…',
  building: 'جاري تجهيز الملف…',
  sending: 'جاري الإرسال…',
};

/**
 * One-click "send this document on WhatsApp" button.
 *
 * Builds the PDF through the caller-supplied `pdf` factory, then hands it to
 * the backend, which resolves the recipient's number and sends it from the
 * company's linked WhatsApp — the user never leaves the dashboard.
 *
 *   <app-whatsapp-send-button
 *     documentType="SupplierInvoice"
 *     [documentId]="inv.id"
 *     [recipientName]="inv.supplierName"
 *     [phone]="supplierPhone()"
 *     [fileName]="'فاتورة-' + inv.invoiceNumber"
 *     [pdf]="buildInvoicePdf" />
 */
@Component({
  selector: 'app-whatsapp-send-button',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './whatsapp-send-button.component.html',
})
export class WhatsappSendButtonComponent {
  readonly documentType = input.required<WhatsappDocumentType>();
  readonly documentId = input.required<number | null | undefined>();
  /** Produces the PDF as raw base64. Called only after the user confirms. */
  readonly pdf = input.required<() => Promise<string>>();
  /** Shown to the recipient; `.pdf` is appended when missing. */
  readonly fileName = input.required<string>();
  readonly caption = input<string>('');
  readonly recipientName = input<string>('');
  /**
   * Recipient number, for the confirmation text only — the server looks the
   * number up itself. `undefined` = not known here (still sendable);
   * `null`/empty = the party has no number (button disabled). Leave it
   * unset for clients: the server prefers their WhatsApp number, which the
   * dashboard models don't carry, so `phoneNumber` could show the wrong one.
   */
  readonly phone = input<string | null | undefined>(undefined);
  readonly disabled = input(false);
  readonly small = input(true);
  readonly label = input('إرسال واتساب');
  /**
   * Send once, as soon as the button is usable, skipping the confirmation —
   * for "حفظ وإرسال واتساب" flows where that click already was the consent.
   */
  readonly autoSend = input(false);

  private readonly whatsapp = inject(WhatsappService);
  private readonly dialog = inject(DialogService);
  private readonly toast = inject(ToastService);
  private readonly injector = inject(Injector);

  private autoSent = false;

  constructor() {
    effect(() => {
      if (!this.autoSend() || this.autoSent || this.isDisabled()) return;
      this.autoSent = true;
      // Wait for the host's document (the PDF source) to be in the DOM.
      afterNextRender(() => void this.send({ confirm: false }), { injector: this.injector });
    });
  }

  protected readonly stage = signal<Stage>('idle');
  protected readonly busy = computed(() => this.stage() !== 'idle');

  private readonly missingPhone = computed(() => {
    const phone = this.phone();
    return phone !== undefined && !phone?.trim();
  });

  protected readonly isDisabled = computed(
    () => this.busy() || this.disabled() || !this.documentId() || this.missingPhone(),
  );

  protected readonly tooltip = computed(() => {
    if (this.missingPhone()) return 'لا يوجد رقم هاتف مسجل لهذا الطرف';
    const phone = this.phone();
    return phone ? `إرسال على واتساب إلى ${phone}` : 'إرسال على واتساب';
  });

  protected readonly stageLabel = computed(() => {
    const stage = this.stage();
    return stage === 'idle' ? '' : STAGE_LABEL[stage];
  });

  protected async send({ confirm = true }: { confirm?: boolean } = {}): Promise<void> {
    const documentId = this.documentId();
    if (this.isDisabled() || !documentId) return;

    // Fail fast (before building a PDF) when the company number can't send.
    this.stage.set('checking');
    const blocked = await this.connectionProblem();
    this.stage.set('idle');
    if (blocked) {
      this.toast.warning(blocked, { duration: 8000 });
      return;
    }

    const docLabel = WHATSAPP_DOCUMENT_LABEL[this.documentType()];
    const name = this.recipientName().trim();
    const phone = this.phone()?.trim();
    const target = [name, phone ? `(${phone})` : ''].filter(Boolean).join(' ');

    if (confirm) {
      const ok = await this.dialog.confirm({
        title: 'إرسال عبر واتساب',
        message: target
          ? `سيتم إرسال ${docLabel} إلى ${target} على واتساب. هل تريد المتابعة؟`
          : `سيتم إرسال ${docLabel} على واتساب إلى الرقم المسجل. هل تريد المتابعة؟`,
        confirmText: 'إرسال',
        cancelText: 'إلغاء',
        type: 'info',
      });
      if (!ok) return;
    }

    try {
      this.stage.set('building');
      const pdfBase64 = await this.pdf()();

      this.stage.set('sending');
      const caption = this.caption().trim();
      const result = await firstValueFrom(
        this.whatsapp.sendDocument({
          documentType: this.documentType(),
          documentId,
          pdfBase64,
          fileName: this.normalizeFileName(this.fileName()),
          ...(caption ? { caption } : {}),
        }),
      );

      const to = result?.to || phone;
      this.toast.success(
        to ? `تم إرسال ${docLabel} على واتساب إلى ${to}` : `تم إرسال ${docLabel} على واتساب`,
      );
    } catch (err) {
      if (this.isAmbiguousFailure(err)) {
        // The provider may still deliver after we stop waiting — retrying
        // blindly could send the document twice.
        this.toast.warning(
          'انتهت مهلة الانتظار وقد تكون الرسالة وصلت بالفعل. تأكد من محادثة واتساب قبل إعادة الإرسال.',
          { duration: 10000 },
        );
      } else {
        this.toast.error(this.errorMessage(err));
      }
    } finally {
      this.stage.set('idle');
    }
  }

  /**
   * Returns a user-facing reason when the linked number isn't WORKING, or
   * null to proceed. A cached non-WORKING answer is re-checked fresh so a
   * just-reconnected number isn't blocked for the cache TTL. If the status
   * itself can't be read, let the send go ahead — the server re-validates.
   */
  private async connectionProblem(): Promise<string | null> {
    try {
      let { status } = await firstValueFrom(this.whatsapp.status());
      if (status !== 'WORKING') {
        ({ status } = await firstValueFrom(this.whatsapp.refreshStatus()));
      }
      if (status === 'WORKING') return null;
      return WHATSAPP_STATUS_BLOCKED_MESSAGE[status] ?? 'رقم واتساب الشركة غير جاهز للإرسال حالياً';
    } catch {
      return null;
    }
  }

  /** No response (client timeout / dropped connection) or a gateway timeout. */
  private isAmbiguousFailure(err: unknown): boolean {
    if (!err || typeof err !== 'object' || !('status' in err)) return false;
    const status = (err as ApiError).status;
    return status === 0 || status === 504;
  }

  private errorMessage(err: unknown): string {
    if (err instanceof PdfTooLargeError) return err.message;
    if (err && typeof err === 'object' && 'status' in err) {
      const apiErr = err as ApiError;
      // A bare 404 (no server message) means the send endpoint itself is
      // missing — not that the document is.
      if (apiErr.status === 404 && !apiErr.fieldErrors && !this.hasServerMessage(apiErr)) {
        return 'خدمة الإرسال على واتساب غير متاحة حالياً على الخادم';
      }
      return apiErrorToMessage(apiErr, 'تعذّر إرسال الرسالة على واتساب — حاول مرة أخرى');
    }
    return 'تعذّر تجهيز ملف PDF للإرسال';
  }

  /** The backend writes its own WhatsApp errors in Arabic; anything else is framework noise. */
  private hasServerMessage(err: ApiError): boolean {
    const body = err.raw as { message?: unknown } | null | undefined;
    return typeof body?.message === 'string' && containsArabic(body.message);
  }

  /** Strips characters WhatsApp/OS file names choke on and ensures `.pdf`. */
  private normalizeFileName(raw: string): string {
    const base = raw.trim().replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, '-') || 'document';
    return /\.pdf$/i.test(base) ? base : `${base}.pdf`;
  }
}
