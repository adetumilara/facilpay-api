export const SUPPORTED_LOCALES = ['en', 'fr', 'es', 'pt'] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: SupportedLocale = 'en';

/** BCP 47 tags used for Intl formatting of each supported language. */
const INTL_LOCALES: Record<SupportedLocale, string> = {
  en: 'en-US',
  fr: 'fr-FR',
  es: 'es-ES',
  pt: 'pt-BR',
};

export function isSupportedLocale(value: unknown): value is SupportedLocale {
  return typeof value === 'string' && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

/** Maps inputs like "pt-BR", "FR", "es_MX" to a supported locale, or the default. */
export function normalizeLocale(value: string | null | undefined): SupportedLocale {
  if (!value) return DEFAULT_LOCALE;
  const primary = value.trim().toLowerCase().split(/[-_]/)[0];
  return isSupportedLocale(primary) ? primary : DEFAULT_LOCALE;
}

/**
 * Picks the best supported locale from an Accept-Language header, honouring
 * q-values. Returns null when nothing in the header is supported.
 */
export function resolveLocaleFromAcceptLanguage(
  header: string | string[] | null | undefined,
): SupportedLocale | null {
  const value = Array.isArray(header) ? header.join(',') : header;
  if (!value) return null;

  const candidates = value
    .split(',')
    .map((part, index) => {
      const [tag, ...params] = part.trim().split(';');
      const qParam = params.find((p) => p.trim().startsWith('q='));
      const q = qParam ? Number(qParam.trim().slice(2)) : 1;
      return { tag: tag.trim(), q: Number.isFinite(q) ? q : 0, index };
    })
    .filter((c) => c.tag && c.tag !== '*' && c.q > 0)
    .sort((a, b) => b.q - a.q || a.index - b.index);

  for (const candidate of candidates) {
    const primary = candidate.tag.toLowerCase().split(/[-_]/)[0];
    if (isSupportedLocale(primary)) return primary;
  }
  return null;
}

export function intlLocale(locale: string | null | undefined): string {
  return INTL_LOCALES[normalizeLocale(locale)];
}

/**
 * Formats an amount for display. ISO 4217 currencies use the locale's currency
 * format; asset codes Intl does not know (e.g. USDC) fall back to a localised
 * number followed by the code.
 */
export function formatMoney(
  amount: string | number,
  currency: string,
  locale: string | null | undefined,
): string {
  const value = typeof amount === 'number' ? amount : Number(amount);
  if (!Number.isFinite(value)) return `${amount} ${currency}`;

  const tag = intlLocale(locale);
  const code = currency.toUpperCase();
  if (/^[A-Z]{3}$/.test(code)) {
    try {
      return new Intl.NumberFormat(tag, {
        style: 'currency',
        currency: code,
        currencyDisplay: 'symbol',
      }).format(value);
    } catch {
      // fall through to the plain number format
    }
  }
  const number = new Intl.NumberFormat(tag, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 7,
  }).format(value);
  return `${number} ${code}`;
}

export function formatDate(
  date: Date,
  locale: string | null | undefined,
  options: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'long', day: 'numeric' },
): string {
  return new Intl.DateTimeFormat(intlLocale(locale), { timeZone: 'UTC', ...options }).format(date);
}
