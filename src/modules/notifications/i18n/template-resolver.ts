import { existsSync } from 'fs';
import { join } from 'path';
import { DEFAULT_LOCALE, normalizeLocale } from './locale';

export const TEMPLATES_DIR = join(__dirname, '..', 'templates');

/**
 * Resolves `<locale>/<name>` relative to the templates directory, falling back
 * to the English template when no translation exists for the locale.
 */
export function resolveTemplatePath(
  templateName: string,
  locale: string | null | undefined,
  templatesDir: string = TEMPLATES_DIR,
): string {
  const normalized = normalizeLocale(locale);
  if (
    normalized !== DEFAULT_LOCALE &&
    existsSync(join(templatesDir, normalized, `${templateName}.hbs`))
  ) {
    return `${normalized}/${templateName}`;
  }
  return `${DEFAULT_LOCALE}/${templateName}`;
}
