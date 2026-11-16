const WHATSAPP_SHARE_URL = 'https://wa.me/';

/**
 * Opens WhatsApp (web or app) with `text` pre-filled; the user picks the
 * recipient there. Purely client-side — no backend, no Wavex — so it suits
 * documents with no single owner/phone (e.g. a classification statement).
 *
 * For sending a PDF straight to a known party, use `app-whatsapp-send-button`.
 */
export function openWhatsappShare(text: string): void {
  const url = `${WHATSAPP_SHARE_URL}?text=${encodeURIComponent(text)}`;
  window.open(url, '_blank', 'noopener,noreferrer');
}
