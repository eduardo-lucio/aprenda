import React, { createContext, useCallback, useContext, useMemo } from 'react';
import { pt } from './pt';
import { en } from './en';

export type Lang = 'pt' | 'en';
export type MessageKey = keyof typeof pt;
export type TranslateFn = (key: MessageKey, vars?: Record<string, string | number>) => string;

const DICTS: Record<Lang, Record<MessageKey, string>> = { pt, en };

/** Accepts the new codes ('pt' | 'en') and the labels saved by older versions ("English (US)", ...). */
export function normalizeLang(value: unknown): Lang {
  return /^en\b|english/i.test(String(value || '')) ? 'en' : 'pt';
}

export function translate(lang: Lang, key: MessageKey, vars?: Record<string, string | number>): string {
  const template = DICTS[lang][key] ?? pt[key] ?? String(key);
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (m, name) => (name in vars ? String(vars[name]) : m));
}

const I18nContext = createContext<Lang>('pt');

export const I18nProvider: React.FC<{ lang: Lang; children: React.ReactNode }> = ({ lang, children }) => (
  <I18nContext.Provider value={lang}>{children}</I18nContext.Provider>
);

/** Current UI language (Portuguese by default, also outside a provider) and its translate function. */
export function useI18n(): { lang: Lang; t: TranslateFn } {
  const lang = useContext(I18nContext);
  const t = useCallback<TranslateFn>((key, vars) => translate(lang, key, vars), [lang]);
  return useMemo(() => ({ lang, t }), [lang, t]);
}

/** BCP-47 locale for dates and numbers. */
export function localeOf(lang: Lang): string {
  return lang === 'en' ? 'en-US' : 'pt-BR';
}
