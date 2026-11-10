import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { LanguageContext, type LanguageContextValue } from "./LanguageContext";
import { LANGUAGE_STORAGE_KEY, translate, type Language } from "./translations";

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, updateLanguage] = useState<Language>("en");
  useEffect(() => {
    try {
      const saved = localStorage.getItem(LANGUAGE_STORAGE_KEY);
      if (saved === "en" || saved === "my") updateLanguage(saved);
    } catch {
      /* Storage is optional; the switch still works for this session. */
    }
  }, []);
  const setLanguage = useCallback((next: Language) => {
    updateLanguage(next);
    try {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, next);
    } catch {
      /* Optional persistence. */
    }
  }, []);
  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);
  useEffect(() => {
    // Translation/font reflow changes scroll positions, not animation identities.
    let active = true;
    let frame = 0;
    const measure = () => {
      if (!active) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (!active || !document.querySelector("[data-animated-content]")) return;
        void import("gsap/ScrollTrigger")
          .then(({ ScrollTrigger }) => {
            if (active) ScrollTrigger.refresh();
          })
          .catch(() => {
            /* Existing animation fallbacks keep content readable. */
          });
      });
    };
    measure();
    void document.fonts?.ready.then(measure).catch(() => {});
    return () => {
      active = false;
      cancelAnimationFrame(frame);
    };
  }, [language]);
  const value = useMemo<LanguageContextValue>(
    () => ({
      language,
      setLanguage,
      t: (key, values) => translate(language, key, values),
      display: (source, values) => translate(language, source, values),
    }),
    [language, setLanguage],
  );
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}
