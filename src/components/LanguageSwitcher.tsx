import { useLanguage } from "@/i18n/useLanguage";

export function LanguageSwitcher() {
  const { language, setLanguage, t } = useLanguage();
  return (
    <div
      role="group"
      aria-label={t("Language")}
      className="pointer-events-auto inline-flex shrink-0 items-center rounded-md border border-data/25 bg-background/60 p-0.5 text-xs text-foreground"
    >
      <button
        type="button"
        lang="en"
        aria-pressed={language === "en"}
        onClick={() => setLanguage("en")}
        className={`focus-ring min-h-9 rounded px-2 ${language === "en" ? "bg-mars/15 text-mars" : "text-muted-foreground"}`}
      >
        EN
      </button>
      <span aria-hidden="true" className="text-muted-foreground">|</span>
      <button
        type="button"
        lang="my"
        aria-pressed={language === "my"}
        onClick={() => setLanguage("my")}
        className={`focus-ring min-h-9 rounded px-2 ${language === "my" ? "bg-mars/15 text-mars" : "text-muted-foreground"}`}
      >
        မြန်မာ
      </button>
    </div>
  );
}
