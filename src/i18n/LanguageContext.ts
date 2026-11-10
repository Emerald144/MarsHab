import { createContext } from "react";
import {
  translate,
  type Language,
  type TranslationKey,
  type TranslationValues,
} from "./translations";

export interface LanguageContextValue {
  language: Language;
  setLanguage: (language: Language) => void;
  t: (key: TranslationKey, values?: TranslationValues) => string;
  display: (source: string, values?: TranslationValues) => string;
}

export const LanguageContext = createContext<LanguageContextValue>({
  language: "en",
  setLanguage: () => {},
  t: (key, values) => translate("en", key, values),
  display: (source, values) => translate("en", source, values),
});
