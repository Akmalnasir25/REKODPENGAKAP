import React, { createContext, useContext, useState, useCallback } from 'react';
import { ms } from './ms';
import { en } from './en';

export type Locale = 'ms' | 'en';
export type Translations = typeof ms;

const translations: Record<Locale, Translations> = { ms, en };

interface I18nContextType {
  locale: Locale;
  t: Translations;
  setLocale: (locale: Locale) => void;
  toggleLocale: () => void;
}

const I18nContext = createContext<I18nContextType | null>(null);

export const I18nProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [locale, setLocaleState] = useState<Locale>(() => {
    const saved = localStorage.getItem('app_locale') as Locale;
    return saved && translations[saved] ? saved : 'ms';
  });

  const setLocale = useCallback((newLocale: Locale) => {
    setLocaleState(newLocale);
    localStorage.setItem('app_locale', newLocale);
    document.documentElement.lang = newLocale;
  }, []);

  const toggleLocale = useCallback(() => {
    setLocale(locale === 'ms' ? 'en' : 'ms');
  }, [locale, setLocale]);

  const t = translations[locale];

  return (
    <I18nContext.Provider value={{ locale, t, setLocale, toggleLocale }}>
      {children}
    </I18nContext.Provider>
  );
};

export const useI18n = (): I18nContextType => {
  const context = useContext(I18nContext);
  if (!context) throw new Error('useI18n must be used within I18nProvider');
  return context;
};

/**
 * Language switcher component
 */
export const LanguageSwitcher: React.FC<{ className?: string }> = ({ className = '' }) => {
  const { locale, toggleLocale } = useI18n();

  return (
    <button
      onClick={toggleLocale}
      className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-bold transition border ${className}`}
      title={locale === 'ms' ? 'Switch to English' : 'Tukar ke Bahasa Melayu'}
    >
      <span className="text-sm">{locale === 'ms' ? '🇲🇾' : '🇬🇧'}</span>
      <span>{locale === 'ms' ? 'BM' : 'EN'}</span>
    </button>
  );
};
