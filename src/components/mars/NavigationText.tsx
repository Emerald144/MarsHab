import { useLanguage } from "@/i18n/useLanguage";
import { translate } from "@/i18n/translations";

/** Size navigation labels for both scripts without changing their typography. */
export function NavigationText({ text }: { text: string }) {
  const { display } = useLanguage();
  return (
    <span className="inline-grid whitespace-nowrap align-middle">
      <span
        aria-hidden="true"
        lang="en"
        className="invisible col-start-1 row-start-1 pointer-events-none select-none"
      >
        {translate("en", text)}
      </span>
      <span
        aria-hidden="true"
        lang="my"
        className="invisible col-start-1 row-start-1 pointer-events-none select-none"
      >
        {translate("my", text)}
      </span>
      <span className="col-start-1 row-start-1">{display(text)}</span>
    </span>
  );
}
