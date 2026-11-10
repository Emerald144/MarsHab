import { useEffect } from "react";
import { useLanguage } from "./useLanguage";
import type { TranslationKey } from "./translations";

/** Route metadata changes in place, independently from mission and canvas lifecycles. */
export function usePageTranslation(title: TranslationKey, description?: TranslationKey) {
  const { t } = useLanguage();
  useEffect(() => {
    document.title = t(title);
    if (description)
      document.querySelector('meta[name="description"]')?.setAttribute("content", t(description));
  }, [t, title, description]);
}
