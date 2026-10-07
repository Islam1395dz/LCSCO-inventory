import React, { createContext, useContext, useState } from 'react';

export type AppLanguage = 'en' | 'fr';

interface LanguageContextValue {
  language: AppLanguage;
  setLanguage: (lang: AppLanguage) => void;
  toggleLanguage: () => void;
  tr: (en: string, fr: string) => string;
}

const LANGUAGE_STORAGE_KEY = 'lcsco_app_language';

const LanguageContext = createContext<LanguageContextValue | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<AppLanguage>(() => {
    try {
      const saved = localStorage.getItem(LANGUAGE_STORAGE_KEY);
      if (saved === 'fr' || saved === 'en') {
        return saved;
      }
    } catch {
      // Ignore storage errors
    }
    return 'en';
  });

  const setLanguage = (lang: AppLanguage) => {
    setLanguageState(lang);
    try {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
    } catch {
      // Ignore storage errors
    }
  };

  const toggleLanguage = () => {
    setLanguage(language === 'en' ? 'fr' : 'en');
  };

  const tr = (en: string, fr: string): string => {
    return language === 'fr' ? fr : en;
  };

  return (
    <LanguageContext.Provider
      value={{
        language,
        setLanguage,
        toggleLanguage,
        tr,
      }}
    >
      {children}
    </LanguageContext.Provider>
  );
};

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    return {
      language: 'en',
      setLanguage: () => {},
      toggleLanguage: () => {},
      tr: (en: string) => en,
    };
  }
  return ctx;
}

export const LanguageSwitchButton: React.FC<{ className?: string }> = ({ className = '' }) => {
  const { language, setLanguage } = useLanguage();

  return (
    <div
      className={`inline-flex items-center rounded-md border border-slate-300 bg-slate-100 p-0.5 text-xs font-mono ${className}`}
      role="group"
      aria-label="Language switcher"
    >
      <button
        type="button"
        onClick={() => setLanguage('en')}
        className={`px-2.5 py-1 rounded transition-colors cursor-pointer ${
          language === 'en'
            ? 'bg-[#1B8A2A] text-white font-bold'
            : 'text-slate-600 hover:text-slate-900'
        }`}
      >
        EN
      </button>
      <button
        type="button"
        onClick={() => setLanguage('fr')}
        className={`px-2.5 py-1 rounded transition-colors cursor-pointer ${
          language === 'fr'
            ? 'bg-[#1B8A2A] text-white font-bold'
            : 'text-slate-600 hover:text-slate-900'
        }`}
      >
        FR
      </button>
    </div>
  );
};
