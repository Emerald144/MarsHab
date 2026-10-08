import { useEffect, useState, type ReactNode } from "react";
import { tierColor } from "@/lib/mission-data";

export function useCountUp(target: number, ms = 1000) {
  const [v, setV] = useState(0);
  useEffect(() => {
    let raf = 0; const start = performance.now(); const from = 0;
    const tick = (t: number) => { const k = Math.min(1, (t - start) / ms); setV(from + (target - from) * (1 - Math.pow(1 - k, 3))); if (k < 1) raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
}

export function Panel({ title, children, className = "", right }: { title?: ReactNode; children: ReactNode; className?: string; right?: ReactNode }) {
  return (
    <section className={`glass p-5 ${className}`}>
      {title && <div className="mb-4 flex items-center justify-between"><h3 className="label-caps text-data">{title}</h3>{right}</div>}
      {children}
    </section>
  );
}

export function Ring({ value, size = 140 }: { value: number; size?: number }) {
  const v = useCountUp(value);
  const r = size / 2 - 10, c = 2 * Math.PI * r;
  const col = tierColor(value);
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="oklch(1 0 0 / 0.08)" strokeWidth="8" fill="none" />
        <circle cx={size / 2} cy={size / 2} r={r} stroke={col} strokeWidth="8" fill="none" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - v / 100)} style={{ filter: `drop-shadow(0 0 6px ${col})` }} />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center font-display text-3xl font-bold">{Math.round(v)}%</div>
    </div>
  );
}

export function Bar({ label, value }: { label: string; value: number }) {
  const [w, setW] = useState(0);
  useEffect(() => { const t = setTimeout(() => setW(value), 50); return () => clearTimeout(t); }, [value]);
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs"><span className="text-muted-foreground">{label}</span><span className="font-mono">{value}%</span></div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full transition-all duration-700" style={{ width: `${w}%`, background: tierColor(value), boxShadow: `0 0 8px ${tierColor(value)}` }} /></div>
    </div>
  );
}

export function Counter({ value, decimals = 0, suffix = "" }: { value: number; decimals?: number; suffix?: string }) {
  const v = useCountUp(value);
  return <>{v.toFixed(decimals)}{suffix}</>;
}

export function Legend() {
  return (
    <div className="glass space-y-1.5 p-3 text-xs">
      <div className="label-caps mb-1">Survival Suitability</div>
      <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-sm bg-safe" />80–100 HIGH</div>
      <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-sm bg-caution" />60–79 MODERATE</div>
      <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-sm bg-danger" />0–59 LOW</div>
      <div className="pt-1 text-[10px] text-muted-foreground">Prototype calculations, not official NASA classifications.</div>
    </div>
  );
}
