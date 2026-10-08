export type Mode = "survival" | "science" | "emergency";
export type Factors = { terrain: number; resource: number; access: number; env: number; science: number };
export type Zone = { id: string; points: string; center: [number, number]; factors: Factors; travel: number; reasons: string[] };

export const MODE_WEIGHTS: Record<Mode, { label: string; weights: Partial<Record<keyof Factors, number>> }> = {
  survival: { label: "Survival", weights: { terrain: 0.35, resource: 0.3, access: 0.25, science: 0.1 } },
  science: { label: "Science", weights: { science: 0.35, terrain: 0.25, resource: 0.2, access: 0.2 } },
  emergency: { label: "Emergency", weights: { access: 0.4, terrain: 0.3, env: 0.2, resource: 0.1 } },
};

export const FACTOR_LABELS: Record<keyof Factors, string> = {
  terrain: "Terrain Safety",
  resource: "Resource Access",
  access: "Accessibility",
  env: "Environmental Risk",
  science: "Science Value",
};

export function score(f: Factors, mode: Mode) {
  const w = MODE_WEIGHTS[mode].weights;
  let s = 0;
  for (const k in w) s += (f[k as keyof Factors] ?? 0) * (w[k as keyof Factors] ?? 0);
  return Math.round(s);
}
export const tier = (s: number) => (s >= 80 ? "HIGH" : s >= 60 ? "MODERATE" : "LOW");
export const tierColor = (s: number) => (s >= 80 ? "var(--safe)" : s >= 60 ? "var(--caution)" : "var(--danger)");

// Map coordinate space: 1000 x 680
export const BASE: [number, number] = [170, 560];

export const ZONES: Zone[] = [
  { id: "A-12", points: "60,80 260,60 300,220 120,260", center: [185, 160], travel: 1.6, factors: { terrain: 88, resource: 80, access: 86, env: 78, science: 74 }, reasons: ["Smooth crater-floor plains", "Moderate resource access", "Direct route from base"] },
  { id: "A-13", points: "300,220 260,60 470,50 500,230", center: [385, 140], travel: 1.9, factors: { terrain: 74, resource: 70, access: 72, env: 66, science: 78 }, reasons: ["Mixed terrain with boulder fields", "Moderate science value", "Longer access corridor"] },
  { id: "A-14", points: "470,50 680,40 640,210 500,230", center: [575, 130], travel: 2.4, factors: { terrain: 40, resource: 52, access: 44, env: 38, science: 70 }, reasons: ["Steep crater-rim slopes", "Elevated hazard exposure", "Difficult accessibility"] },
  { id: "A-15", points: "60,280 120,260 300,220 330,400 90,430", center: [190, 330], travel: 0.9, factors: { terrain: 95, resource: 90, access: 94, env: 86, science: 68 }, reasons: ["Flat, stable terrain", "Simulated ice signatures nearby", "Close to base"] },
  { id: "A-16", points: "300,220 500,230 520,410 330,400", center: [415, 315], travel: 1.4, factors: { terrain: 64, resource: 62, access: 66, env: 60, science: 62 }, reasons: ["Scattered dunes", "Average resource signals", "Caution on slopes > 12°"] },
  { id: "A-17", points: "680,40 900,60 940,300 740,330 640,210", center: [790, 190], travel: 1.8, factors: { terrain: 91, resource: 84, access: 88, env: 79, science: 82 }, reasons: ["Relatively favorable terrain", "Good simulated resource accessibility", "Suitable route accessibility", "Acceptable environmental risk", "Useful science targets nearby"] },
  { id: "A-18", points: "500,230 640,210 740,330 700,450 520,410", center: [615, 330], travel: 1.5, factors: { terrain: 50, resource: 48, access: 56, env: 44, science: 66 }, reasons: ["Delta-front scarps", "High environmental risk", "Constrained traverse lanes"] },
  { id: "A-19", points: "520,410 700,450 940,300 960,640 540,650", center: [760, 520], travel: 1.2, factors: { terrain: 82, resource: 76, access: 84, env: 75, science: 70 }, reasons: ["Gentle delta deposits", "Accessible from base", "Moderate science potential"] },
];

export const SCIENCE_TARGETS = [
  { name: "Delta Front", p: [700, 260] }, { name: "Séítah Ridge", p: [430, 180] }, { name: "Belva Crater", p: [860, 420] },
  { name: "Kodiak Butte", p: [560, 520] }, { name: "Margin Unit", p: [880, 140] },
];
export const RESOURCES = [{ name: "Ice signature R1", p: [220, 340] }, { name: "Hydrated minerals R2", p: [820, 240] }, { name: "Ice signature R3", p: [740, 560] }];
export const HAZARDS = [{ name: "Rim slopes", p: [580, 110], r: 55 }, { name: "Boulder field", p: [620, 350], r: 45 }, { name: "Dune trap", p: [400, 330], r: 35 }];
export const ROVER_OBS = [{ name: "Sol 412", p: [260, 500] }, { name: "Sol 518", p: [450, 450] }, { name: "Sol 603", p: [640, 400] }];

export type RouteId = "A" | "B" | "C";
export const ROUTES: Record<RouteId, { name: string; style: string; color: string; dash?: string; distance: number; terrain: string; resource: string; science: string; time: number; feasible: boolean; score: number | null; afterScore: number }> = {
  A: { name: "Shortest Path", style: "direct", color: "var(--data)", dash: "10 8", distance: 7.2, terrain: "Medium", resource: "Medium", science: "Medium", time: 4.9, feasible: true, score: 78, afterScore: 80 },
  B: { name: "Balanced Survival", style: "balanced", color: "var(--safe)", distance: 8.1, terrain: "Low", resource: "High", science: "High", time: 5.2, feasible: true, score: 91, afterScore: 69 },
  C: { name: "Science Priority", style: "science", color: "var(--caution)", dash: "2 8", distance: 9.0, terrain: "Low", resource: "High", science: "Very High", time: 6.7, feasible: false, score: null, afterScore: 76 },
};

export function routePath(id: RouteId, dest: [number, number]) {
  const [bx, by] = BASE, [dx, dy] = dest;
  const mx = (bx + dx) / 2, my = (by + dy) / 2;
  if (id === "A") return `M${bx},${by} Q${mx - 40},${my - 40} ${dx},${dy}`;
  if (id === "B") return `M${bx},${by} C${bx + 220},${by + 30} ${mx + 140},${my + 120} ${dx},${dy}`;
  return `M${bx},${by} C${bx + 20},${by - 260} ${mx - 60},${my - 220} ${dx},${dy}`;
}
