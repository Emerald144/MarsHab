import { ArrowRight, Siren, Trash2 } from "lucide-react";
import { DataBadge } from "./DataBadge";

export function StyleGuide() {
  return (
    <div className="glass space-y-6 p-6">
      <div className="label-caps text-mars">Step 3 · Style guide (temporary)</div>

      <div className="space-y-2">
        <div className="label-caps">Buttons</div>
        <div className="flex flex-wrap items-center gap-3">
          <button className="btn-mars btn-lg">
            Primary <ArrowRight className="h-4 w-4" />
          </button>
          <button className="btn-ghost btn-md">Secondary</button>
          <button className="btn-danger btn-md">
            <Siren className="h-4 w-4" /> Emergency
          </button>
          <button className="btn-text">Learn more</button>
          <button className="btn-ghost btn-icon" aria-label="Delete">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="space-y-2">
        <div className="label-caps">Sizes (44 / 40 / 32)</div>
        <div className="flex flex-wrap items-center gap-3">
          <button className="btn-mars btn-lg">Large</button>
          <button className="btn-mars btn-md">Medium</button>
          <button className="btn-mars btn-sm">Small</button>
        </div>
      </div>

      <div className="space-y-2">
        <div className="label-caps">Disabled</div>
        <div className="flex flex-wrap items-center gap-3">
          <button className="btn-mars btn-md" disabled>Primary</button>
          <button className="btn-ghost btn-md" disabled>Secondary</button>
          <button className="btn-danger btn-md" disabled>Danger</button>
        </div>
      </div>

      <div className="space-y-2">
        <div className="label-caps">Data badges</div>
        <div className="flex flex-wrap items-center gap-3">
          <DataBadge kind="real" />
          <DataBadge kind="simulated" />
          <DataBadge kind="illustrative" />
        </div>
      </div>
    </div>
  );
}