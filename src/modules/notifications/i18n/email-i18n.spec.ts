import { readFileSync } from 'fs';
import { join } from 'path';
import * as Handlebars from 'handlebars';
import {
  SUPPORTED_LOCALES,
  formatDate,
  formatMoney,
  normalizeLocale,
  resolveLocaleFromAcceptLanguage,
} from './locale';
import { translate } from './messages';
import { TEMPLATES_DIR, resolveTemplatePath } from './template-resolver';

const PAYER_TEMPLATES = [
  'payer-payment-confirmed',
  'payer-refund-processed',
  'payer-dispute-opened',
  'payer-dispute-status-changed',
  'payer-recurring-payment-reminder',
  'invoice-reminder',
];

function render(locale: string, templateName: string): string {
  const path = resolveTemplatePath(templateName, locale);
  const source = readFileSync(join(TEMPLATES_DIR, `${path}.hbs`), 'utf8');
  // Same options the mailer uses, so a missing variable fails the test.
  const template = Handlebars.compile(source, { strict: true });

  const chargeDate = new Date('2026-03-29T12:00:00Z');
  return template({
    locale,
    year: 2026,
    appUrl: 'https://app.facilpay.test',
    unsubscribeUrl: 'https://app.facilpay.test/unsubscribe?email=abc',
    payerName: 'Ada',
    merchantName: 'Acme Store',
    merchantLogo: null,
    merchantEmail: 'billing@acme.test',
    primaryColor: '#059669',
    supportEmail: 'help@acme.test',
    supportUrl: 'https://acme.test/support',
    paymentId: 'pay_123',
    paymentDescription: 'Order #42',
    formattedAmount: formatMoney('1234.5', 'BRL', locale),
    formattedRefundAmount: formatMoney('99.9', 'BRL', locale),
    date: formatDate(chargeDate, locale),
    refundId: 'ref_456',
    refundReason: 'Duplicate charge',
    disputeId: 'dsp_789',
    disputeReason: 'Item not received',
    previousStatus: 'OPEN',
    newStatus: 'RESOLVED',
    resolutionNotes: 'Refunded in full',
    chargeDate: formatDate(chargeDate, locale, {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }),
    planDescription: 'Monthly plan',
    manageUrl: 'https://app.facilpay.test/recurring/1',
    cancelUrl: 'https://app.facilpay.test/recurring/1/cancel',
    previewText: translate(locale, 'preview.invoiceBefore', { merchant: 'Acme Store' }),
    dueDate: formatDate(chargeDate, locale),
  });
}

describe('email i18n', () => {
  describe('payer template snapshots', () => {
    for (const locale of SUPPORTED_LOCALES) {
      describe(locale, () => {
        it.each(PAYER_TEMPLATES)('%s', (templateName) => {
          const html = render(locale, templateName);
          expect(resolveTemplatePath(templateName, locale)).toBe(`${locale}/${templateName}`);
          expect(html).toMatchSnapshot();
        });
      });
    }
  });

  describe('fallback', () => {
    it('falls back to English for templates without a translation', () => {
      expect(resolveTemplatePath('merchant-payment-received', 'fr')).toBe(
        'en/merchant-payment-received',
      );
    });

    it('falls back to English for unsupported locales', () => {
      expect(resolveTemplatePath('payer-payment-confirmed', 'de')).toBe(
        'en/payer-payment-confirmed',
      );
      expect(normalizeLocale('de-DE')).toBe('en');
      expect(normalizeLocale(undefined)).toBe('en');
    });

    it('falls back to English for message keys missing in a locale', () => {
      expect(translate('fr', 'subject.doesNotExist')).toBe('subject.doesNotExist');
      expect(translate('de', 'subject.invoiceOnDue')).toBe('Invoice due today');
    });
  });

  describe('locale resolution', () => {
    it('normalises regional tags', () => {
      expect(normalizeLocale('pt-BR')).toBe('pt');
      expect(normalizeLocale('ES_mx')).toBe('es');
    });

    it('honours Accept-Language q-values', () => {
      expect(resolveLocaleFromAcceptLanguage('de-DE,fr;q=0.8,en;q=0.5')).toBe('fr');
      expect(resolveLocaleFromAcceptLanguage('en;q=0.3, pt-BR;q=0.9')).toBe('pt');
      expect(resolveLocaleFromAcceptLanguage('de, ja')).toBeNull();
      expect(resolveLocaleFromAcceptLanguage(undefined)).toBeNull();
    });
  });

  describe('formatting', () => {
    it('formats ISO currencies per locale', () => {
      expect(formatMoney('1234.5', 'USD', 'en')).toBe('$1,234.50');
      expect(formatMoney('1234.5', 'BRL', 'pt')).toMatch(/^R\$\s1\.234,50$/);
      expect(formatMoney('1234.5', 'EUR', 'fr')).toMatch(/^1\s234,50\s€$/);
    });

    it('formats non-ISO asset codes as number + code', () => {
      expect(formatMoney('10', 'USDC', 'es')).toBe('10,00 USDC');
    });

    it('formats dates per locale', () => {
      const date = new Date('2026-03-29T12:00:00Z');
      expect(formatDate(date, 'en')).toBe('March 29, 2026');
      expect(formatDate(date, 'fr')).toBe('29 mars 2026');
      expect(formatDate(date, 'es')).toBe('29 de marzo de 2026');
      expect(formatDate(date, 'pt')).toBe('29 de março de 2026');
    });

    it('translates subjects with parameters', () => {
      expect(translate('es', 'subject.paymentConfirmed', { amount: '10,00 USDC' })).toBe(
        'Pago confirmado: 10,00 USDC',
      );
    });
  });
});
