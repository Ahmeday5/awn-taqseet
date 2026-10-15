/**
 * Documents that can be sent over WhatsApp. The backend maps each type to
 * the party whose phone receives the message (invoice → supplier,
 * contract → client, statements → the statement's owner).
 */
export type WhatsappDocumentType =
  | 'SupplierInvoice'
  | 'Contract'
  | 'SupplierStatement'
  | 'ClientStatement'
  | 'RepStatement'
  | 'ShareholderStatement'
  | 'SubAccountStatement';

/**
 * Query param a "حفظ وإرسال واتساب" flow appends when it navigates to the
 * saved document's page, asking that page to send it on arrival.
 */
export const WHATSAPP_AUTO_SEND_PARAM = 'sendWhatsapp';

/** Arabic noun used in confirmations / toasts ("إرسال الفاتورة …"). */
export const WHATSAPP_DOCUMENT_LABEL: Record<WhatsappDocumentType, string> = {
  SupplierInvoice: 'الفاتورة',
  Contract: 'العقد',
  SupplierStatement: 'كشف الحساب',
  ClientStatement: 'كشف الحساب',
  RepStatement: 'كشف الحساب',
  ShareholderStatement: 'كشف الحساب',
  SubAccountStatement: 'كشف الحساب',
};

export interface WhatsappSendDocumentRequest {
  readonly documentType: WhatsappDocumentType;
  readonly documentId: number;
  /** Raw base64 (no `data:` prefix). */
  readonly pdfBase64: string;
  readonly fileName: string;
  readonly caption?: string;
}

export interface WhatsappSendResult {
  readonly messageId: string;
  readonly status: string;
  /** Recipient phone as the server resolved it (may be masked). */
  readonly to: string;
}

export type WhatsappConnectionStatus =
  | 'WORKING'
  | 'QR_REQUIRED'
  | 'CONNECTING'
  | 'DISCONNECTED'
  | 'INITIALIZING'
  | 'BANNED';

export interface WhatsappStatus {
  readonly status: WhatsappConnectionStatus;
}

/** Why sending is blocked, per non-WORKING status (only WORKING can send). */
export const WHATSAPP_STATUS_BLOCKED_MESSAGE: Record<Exclude<WhatsappConnectionStatus, 'WORKING'>, string> = {
  QR_REQUIRED: 'رقم واتساب الشركة غير مربوط — يلزم إعادة ربطه بمسح رمز QR من لوحة Wavex',
  DISCONNECTED: 'رقم واتساب الشركة غير متصل — يلزم إعادة ربطه من لوحة Wavex',
  CONNECTING: 'جاري الاتصال برقم واتساب الشركة — حاول مرة أخرى بعد قليل',
  INITIALIZING: 'جاري تجهيز رقم واتساب الشركة — حاول مرة أخرى بعد قليل',
  BANNED: 'رقم واتساب الشركة محظور من واتساب — تواصل مع مسؤول النظام',
};
