import { useEffect, useRef, useState } from "react";
import mapImg from "@/assets/jezero-map.jpg";
import { BASE, HAZARDS, RESOURCES, ROUTES, ROVER_OBS, SCIENCE_TARGETS, ZONES, routePath, score, tierColor, type RouteId } from "@/lib/mission-data";
import { useMission } from "@/lib/mission-store";

export type Layers = { suitability: boolean; terrain: boolean; hazards: boolean; resources: boolean; science: boolean; rover: boolean };

type Props = {
  layers?: Partial<Layers>;
  selectedZone?: string | null;
  onZoneClick?: (id: string) => void;
  showRoutes?: boolean;
  highlightRoute?: RouteId;
  progress?: number; // 0..1 marker along active route
  riskZone?: boolean;
  className?: string;
};

export function MarsMap({ layers = { suitability: true }, selectedZone, onZoneClick, showRoutes, highlightRoute, progress, riskZone, className }: Props) {
  const { mode, destination } = useMission();
  const dest = ZONES.find((z) => z.id === destination)!;
  const pathRefs = useRef<Record<string, SVGPathElement | null>>({});
  const [marker, setMarker] = useState<[number, number] | null>(null);

  useEffect(() => {
    if (progress === undefined || !highlightRoute) return setMarker(null);
    const el = pathRefs.current[highlightRoute];
    if (!el) return;
    const p = el.getPointAtLength(el.getTotalLength() * progress);
    setMarker([p.x, p.y]);
  }, [progress, highlightRoute, destination]);

  return (
    <div className={`relative overflow-hidden rounded-xl border border-border ${className ?? ""}`}>
      <svg viewBox="0 0 1000 680" className="block h-full w-full" preserveAspectRatio="xMidYMid slice">
        <defs>
          <filter id="glow"><feGaussianBlur stdDeviation="4" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
          <pattern id="grid" width="50" height="50" patternUnits="userSpaceOnUse"><path d="M50 0H0V50" fill="none" stroke="oklch(0.84 0.12 205 / 0.08)" /></pattern>
          <radialGradient id="vig"><stop offset="55%" stopColor="black" stopOpacity="0" /><stop offset="100%" stopColor="black" stopOpacity="0.7" /></radialGradient>
        </defs>
        <image href={mapImg} x="0" y="0" width="1000" height="680" preserveAspectRatio="xMidYMid slice" style={{ filter: layers.terrain ? "contrast(1.25) saturate(1.2)" : "brightness(0.7) saturate(0.8)" }} />
        {layers.terrain && Array.from({ length: 7 }).map((_, i) => (
          <ellipse key={i} cx="560" cy="350" rx={90 + i * 55} ry={60 + i * 42} fill="none" stroke="oklch(0.84 0.12 205 / 0.25)" strokeDasharray="3 6" />
        ))}
        <rect width="1000" height="680" fill="url(#grid)" />

        {layers.suitability && ZONES.map((z) => {
          const s = score(z.factors, mode);
          const c = tierColor(s);
          const sel = selectedZone === z.id || (!selectedZone && z.id === destination && showRoutes);
          return (
            <g key={z.id} onClick={() => onZoneClick?.(z.id)} className={onZoneClick ? "cursor-pointer" : ""}>
              <polygon points={z.points} fill={c} fillOpacity={sel ? 0.42 : 0.22} stroke={c} strokeOpacity={sel ? 1 : 0.6} strokeWidth={sel ? 2.5 : 1} className="transition-all duration-500 hover:fill-opacity-40" style={{ filter: sel ? "url(#glow)" : undefined }} />
              <text x={z.center[0]} y={z.center[1] - 6} textAnchor="middle" className="pointer-events-none fill-foreground font-mono text-[13px] font-semibold">{z.id}</text>
              <text x={z.center[0]} y={z.center[1] + 14} textAnchor="middle" fill={c} className="pointer-events-none font-mono text-[15px] font-bold">{s}%</text>
            </g>
          );
        })}

        {riskZone && (
          <g>
            <circle cx="520" cy="470" r="80" fill="var(--danger)" fillOpacity="0.25" stroke="var(--danger)" strokeDasharray="6 6" className="animate-pulse" />
            <text x="520" y="475" textAnchor="middle" className="fill-foreground font-mono text-[12px] font-bold">⚠ RISK ↑</text>
          </g>
        )}

        {layers.hazards && HAZARDS.map((h) => (
          <g key={h.name}>
            <circle cx={h.p[0]} cy={h.p[1]} r={h.r} fill="var(--danger)" fillOpacity="0.12" stroke="var(--danger)" strokeDasharray="4 4" />
            <text x={h.p[0]} y={h.p[1] + h.r + 14} textAnchor="middle" className="fill-foreground font-mono text-[11px]">⚠ {h.name}</text>
          </g>
        ))}
        {layers.resources && RESOURCES.map((r) => (
          <g key={r.name}>
            <circle cx={r.p[0]} cy={r.p[1]} r="7" fill="var(--data)" filter="url(#glow)" />
            <text x={r.p[0] + 12} y={r.p[1] + 4} className="fill-foreground font-mono text-[11px]">❄ {r.name}</text>
          </g>
        ))}
        {layers.science && SCIENCE_TARGETS.map((t) => (
          <g key={t.name}>
            <rect x={t.p[0] - 6} y={t.p[1] - 6} width="12" height="12" transform={`rotate(45 ${t.p[0]} ${t.p[1]})`} fill="var(--caution)" filter="url(#glow)" />
            <text x={t.p[0] + 12} y={t.p[1] + 4} className="fill-foreground font-mono text-[11px]">{t.name}</text>
          </g>
        ))}
        {layers.rover && ROVER_OBS.map((o, i) => (
          <g key={o.name}>
            {i > 0 && <line x1={ROVER_OBS[i - 1].p[0]} y1={ROVER_OBS[i - 1].p[1]} x2={o.p[0]} y2={o.p[1]} stroke="oklch(1 0 0 / 0.5)" strokeDasharray="2 5" />}
            <circle cx={o.p[0]} cy={o.p[1]} r="5" fill="none" stroke="var(--foreground)" strokeWidth="2" />
            <text x={o.p[0] + 10} y={o.p[1] - 8} className="fill-foreground font-mono text-[11px]">◉ {o.name}</text>
          </g>
        ))}

        {showRoutes && (Object.keys(ROUTES) as RouteId[]).map((id, i) => {
          const r = ROUTES[id];
          const active = highlightRoute === id;
          const dim = highlightRoute && !active;
          return (
            <g key={id + destination} opacity={dim ? 0.3 : 1} className="transition-opacity duration-700">
              <path ref={(el) => { pathRefs.current[id] = el; }} d={routePath(id, dest.center)} fill="none" stroke={r.color} strokeWidth={active ? 5 : 3} strokeLinecap="round" className="route-draw" style={{ animationDelay: `${i * 0.4}s`, filter: "url(#glow)" }} />
              {r.dash && <path d={routePath(id, dest.center)} fill="none" stroke="var(--background)" strokeWidth={active ? 5 : 3} strokeDasharray={r.dash} className="route-draw" style={{ animationDelay: `${i * 0.4}s` }} />}
            </g>
          );
        })}

        {/* base */}
        <g>
          <circle cx={BASE[0]} cy={BASE[1]} r="8" fill="var(--data)" className="pulse-marker" />
          <circle cx={BASE[0]} cy={BASE[1]} r="8" fill="var(--data)" stroke="var(--foreground)" strokeWidth="2" />
          <text x={BASE[0] + 14} y={BASE[1] + 24} className="fill-foreground font-mono text-[12px] font-semibold">PERSEVERANCE BASE</text>
        </g>
        {/* destination */}
        <g>
          <circle cx={dest.center[0]} cy={dest.center[1] + 34} r="8" fill="var(--mars)" className="pulse-marker" />
          <circle cx={dest.center[0]} cy={dest.center[1] + 34} r="7" fill="var(--mars)" stroke="var(--foreground)" strokeWidth="2" />
        </g>
        {marker && (
          <g>
            <circle cx={marker[0]} cy={marker[1]} r="10" fill="var(--foreground)" className="pulse-marker" />
            <circle cx={marker[0]} cy={marker[1]} r="7" fill="var(--foreground)" filter="url(#glow)" />
          </g>
        )}
        <rect width="1000" height="680" fill="url(#vig)" pointerEvents="none" />
      </svg>
      <div className="pointer-events-none absolute left-3 top-3 label-caps">JEZERO CRATER · 18.38°N 77.58°E</div>
      <div className="pointer-events-none absolute bottom-3 right-3 label-caps">SIMULATED DATA</div>
    </div>
  );
}
