import { useLanguage } from "@/i18n/useLanguage";

/** Presentation-only disclosures; scientific assumptions remain visible on demand. */
export function ModelDetails() {
  const { display } = useLanguage();
  const notes = [
    "Mars Spacesuit Mass Requirements, ICES-2026-127, equations 3–7 (pp. 8–10). Preliminary research comparison, not medical clearance; further validation is required.",
    "Optional research comparison; not medical clearance. EVA VO2max is used without further deconditioning.",
    "Use loaded suit mass including consumables. Equipment excludes anything already in suit mass. Samples are added at the destination stop; intermediate collection timing is unknown. Dry or unknown mass basis leaves comparison unassessed.",
    "Pressure offload is suit-specific. Any finite nonnegative value, including 2 N, is accepted; 213 N is only the paper preset assumption.",
    "Preset uses rounded paper constants: 227 N lifting reference, 14 mL/kg/min mobility term, 213 N offload. These are preliminary assumptions, not universal limits.",
    "The NIOSH lifting reference is not a general safe carrying limit. Suit architecture and mobility matter independently of mass.",
    "The stated SI inputs calculate 101.02 kg allowance; the paper reports approximately 104 kg. This unresolved difference is retained without tuning constants.",
    "Walking speed is a configurable planning assumption, not a measured astronaut pace. Jezero zones are large regional analysis areas, hundreds of km from the landing site — a single EVA will often not reach a zone centroid.",
    "Assumption: the static grid path is reversible. Changed or blocked paths require a new plan; rerouting restarts the route preview from base.",
    "Simulated resource percentages are scenario assumptions, not oxygen mass, battery energy or validated life-support limits.",
  ];
  return (
    <details className="rounded-md border border-border p-3 text-sm">
      <summary className="cursor-pointer font-medium">{display("Model details")}</summary>
      <div className="mt-3 space-y-3 text-xs leading-relaxed text-muted-foreground">
        {notes.map((note) => (
          <p key={note}>{display(note)}</p>
        ))}
      </div>
    </details>
  );
}

export function SimulationBadge() {
  const { display } = useLanguage();
  return (
    <span className="inline-flex rounded-full border border-caution/40 px-2 py-0.5 text-[11px] font-normal text-caution">
      {display("Simulation")}
    </span>
  );
}
