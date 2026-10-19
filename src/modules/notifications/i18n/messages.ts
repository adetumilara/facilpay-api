import { DEFAULT_LOCALE, SupportedLocale, normalizeLocale } from './locale';

type Messages = Record<string, string>;

/**
 * Subject lines and other strings built in code for payer-facing emails.
 * Keys missing from a locale fall back to English.
 */
const MESSAGES: Record<SupportedLocale, Messages> = {
  en: {
    'subject.paymentConfirmed': 'Payment Confirmed: {amount}',
    'subject.refundProcessed': 'Refund Processed: {amount}',
    'subject.disputeOpened': 'Dispute Opened: {amount}',
    'subject.disputeStatusChanged': 'Dispute Status Updated: {status}',
    'subject.recurringReminder': 'Upcoming Charge: {amount} on {date}',
    'subject.invoiceBefore': 'Reminder: Invoice due in {days} days',
    'subject.invoiceOnDue': 'Invoice due today',
    'subject.invoiceAfter': 'Urgent: Invoice overdue',
    'preview.invoiceBefore': 'Your invoice from {merchant} is due soon.',
    'preview.invoiceOnDue': 'Your invoice from {merchant} is due today.',
    'preview.invoiceAfter': 'Your invoice from {merchant} is now overdue.',
  },
  fr: {
    'subject.paymentConfirmed': 'Paiement confirmé : {amount}',
    'subject.refundProcessed': 'Remboursement effectué : {amount}',
    'subject.disputeOpened': 'Litige ouvert : {amount}',
    'subject.disputeStatusChanged': 'Statut du litige mis à jour : {status}',
    'subject.recurringReminder': 'Prélèvement à venir : {amount} le {date}',
    'subject.invoiceBefore': 'Rappel : facture à régler dans {days} jours',
    'subject.invoiceOnDue': 'Facture à régler aujourd\'hui',
    'subject.invoiceAfter': 'Urgent : facture en retard',
    'preview.invoiceBefore': 'Votre facture de {merchant} arrive bientôt à échéance.',
    'preview.invoiceOnDue': 'Votre facture de {merchant} est à régler aujourd\'hui.',
    'preview.invoiceAfter': 'Votre facture de {merchant} est en retard.',
  },
  es: {
    'subject.paymentConfirmed': 'Pago confirmado: {amount}',
    'subject.refundProcessed': 'Reembolso procesado: {amount}',
    'subject.disputeOpened': 'Disputa abierta: {amount}',
    'subject.disputeStatusChanged': 'Estado de la disputa actualizado: {status}',
    'subject.recurringReminder': 'Próximo cargo: {amount} el {date}',
    'subject.invoiceBefore': 'Recordatorio: factura con vencimiento en {days} días',
    'subject.invoiceOnDue': 'La factura vence hoy',
    'subject.invoiceAfter': 'Urgente: factura vencida',
    'preview.invoiceBefore': 'Tu factura de {merchant} vence pronto.',
    'preview.invoiceOnDue': 'Tu factura de {merchant} vence hoy.',
    'preview.invoiceAfter': 'Tu factura de {merchant} está vencida.',
  },
  pt: {
    'subject.paymentConfirmed': 'Pagamento confirmado: {amount}',
    'subject.refundProcessed': 'Reembolso processado: {amount}',
    'subject.disputeOpened': 'Disputa aberta: {amount}',
    'subject.disputeStatusChanged': 'Status da disputa atualizado: {status}',
    'subject.recurringReminder': 'Próxima cobrança: {amount} em {date}',
    'subject.invoiceBefore': 'Lembrete: fatura vence em {days} dias',
    'subject.invoiceOnDue': 'A fatura vence hoje',
    'subject.invoiceAfter': 'Urgente: fatura vencida',
    'preview.invoiceBefore': 'Sua fatura de {merchant} vence em breve.',
    'preview.invoiceOnDue': 'Sua fatura de {merchant} vence hoje.',
    'preview.invoiceAfter': 'Sua fatura de {merchant} está vencida.',
  },
};

export function translate(
  locale: string | null | undefined,
  key: string,
  params: Record<string, string | number> = {},
): string {
  const template =
    MESSAGES[normalizeLocale(locale)][key] ?? MESSAGES[DEFAULT_LOCALE][key] ?? key;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}
