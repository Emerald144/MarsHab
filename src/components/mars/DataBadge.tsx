import { useLanguage } from "@/i18n/useLanguage";
import { FlaskConical, Image as ImageIcon, Satellite } from "lucide-react";

export type DataKind = "real" | "heuristic" | "simulated" | "illustrative";

const KINDS: Record<
  DataKind,
  { label: string; hint: string; icon: typeof Satellite; cls: string }
> = {
  real: {
    label: "REAL",
    hint: "Derived from NASA datasets",
    icon: Satellite,
    cls: "border-data text-data bg-data/10",
  },
  heuristic: {
    label: "HEURISTIC",
    hint: "Computed from real terrain data using an unvalidated heuristic formula",
    icon: FlaskConical,
    cls: "border-caution text-caution bg-caution/10",
  },
  simulated: {
    label: "SIMULATED",
    hint: "Prototype data generated for this demo",
    icon: FlaskConical,
    cls: "border-simulated text-simulated bg-simulated/10",
  },
  illustrative: {
    label: "ILLUSTRATIVE",
    hint: "AI-generated image, not a NASA product",
    icon: ImageIcon,
    cls: "border-dashed border-muted-foreground text-muted-foreground bg-transparent",
  },
};

type Props = {
  kind: DataKind;
  /** default label ကို ပြောင်းလိုလျှင် (ဥပမာ "SIM · DEMO") */
  label?: string;
  className?: string;
};

export function DataBadge({ kind, label, className = "" }: Props) {
  const { display } = useLanguage();
  const { label: defaultLabel, hint, icon: Icon, cls } = KINDS[kind];
  return (
    <span
      title={display(hint)}
      className={`inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 font-mono text-[11px] leading-none tracking-[0.12em] whitespace-nowrap ${cls} ${className}`}
    >
      <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />
      {display(label ?? defaultLabel)}
    </span>
  );
}
