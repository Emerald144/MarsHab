import { useLanguage } from "@/i18n/useLanguage";
import { Calculator, FlaskConical, HelpCircle, Satellite, Sparkles } from "lucide-react";

/** How a reported value was obtained. Keep scientific category separate from display color. */
export type ValueCategory = "observed" | "derived" | "estimated" | "simulated" | "unavailable";

const CATEGORIES: Record<
  ValueCategory,
  { label: string; hint: string; icon: typeof Satellite; cls: string }
> = {
  observed: {
    label: "OBSERVED",
    hint: "Measured by a NASA instrument; source, date and location shown",
    icon: Satellite,
    cls: "border-data text-data bg-data/10",
  },
  derived: {
    label: "DERIVED",
    hint: "Computed from measured GIS or environment data",
    icon: Calculator,
    cls: "border-safe text-safe bg-safe/10",
  },
  estimated: {
    label: "ESTIMATED",
    hint: "Model result using documented assumptions",
    icon: Sparkles,
    cls: "border-caution text-caution bg-caution/10",
  },
  simulated: {
    label: "SIMULATED",
    hint: "User-created mission scenario or event",
    icon: FlaskConical,
    cls: "border-simulated text-simulated bg-simulated/10",
  },
  unavailable: {
    label: "UNAVAILABLE",
    hint: "Missing or unverified",
    icon: HelpCircle,
    cls: "border-dashed border-muted-foreground text-muted-foreground bg-transparent",
  },
};

export const VALUE_CATEGORIES = Object.keys(CATEGORIES) as ValueCategory[];

export function ValueCategoryBadge({
  category,
  className = "",
}: {
  category: ValueCategory;
  className?: string;
}) {
  const { display } = useLanguage();
  const { label, hint, icon: Icon, cls } = CATEGORIES[category];
  return (
    <span
      title={display(hint)}
      data-value-category={category}
      className={`inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 font-mono text-[10px] leading-none tracking-[0.12em] whitespace-nowrap ${cls} ${className}`}
    >
      <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />
      {display(label)}
    </span>
  );
}

/** One-line legend explaining all five categories. */
export function ValueCategoryLegend({ className = "" }: { className?: string }) {
  const { t, display } = useLanguage();
  return (
    <div className={`flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground ${className}`}>
      <span className="label-caps">{t("Value categories")}</span>
      {VALUE_CATEGORIES.map((category) => (
        <span key={category} className="inline-flex items-center gap-1" title={display(CATEGORIES[category].hint)}>
          <ValueCategoryBadge category={category} />
        </span>
      ))}
    </div>
  );
}
