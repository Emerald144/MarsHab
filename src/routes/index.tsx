import { createFileRoute, Link } from "@tanstack/react-router";
import { MarsCanvas } from "@/components/mars/MarsCanvas";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [{ title: "TerraNexis — Interplanetary Survival Guide" }] }),
  component: Landing,
});

function Landing() {
  return (
    <div className="relative isolate min-h-screen w-screen overflow-hidden bg-[#070D18] text-[#F3F7FB] flex flex-col justify-between">
      <MarsCanvas />

      <header className="relative z-10 flex items-center justify-between px-8 py-6 md:px-16 pointer-events-none">
        <div className="flex items-center gap-3 pointer-events-auto">
          <div className="h-3 w-3 rounded-full bg-orange-500 animate-pulse shadow-[0_0_12px_rgba(249,115,22,0.8)]" />
          <span className="font-mono text-xs tracking-[0.2em] text-orange-400 font-semibold">
            SYSTEM ONLINE // MARS ORBIT
          </span>
        </div>
        <Link
          to="/mission"
          className="pointer-events-auto px-5 py-2 text-xs font-mono tracking-wider rounded-md bg-orange-600/20 border border-orange-500/40 text-orange-300 hover:bg-orange-600/40 transition shadow-lg"
        >
          SKIP TO MISSION &rarr;
        </Link>
      </header>

      <section className="relative z-10 flex flex-col items-start px-8 md:px-16 pb-12 max-w-4xl pointer-events-none">
        <p className="font-mono text-xs md:text-sm tracking-[0.35em] text-[#B7C7D8] uppercase bg-slate-900/60 backdrop-blur-md px-3 py-1 rounded border border-slate-700/50 mb-4">
          Interplanetary Survival Guide
        </p>

        <h1 className="text-6xl md:text-8xl font-extrabold tracking-[0.3em] text-transparent bg-clip-text bg-gradient-to-r from-white via-slate-100 to-orange-200 drop-shadow-[0_10px_20px_rgba(0,0,0,0.8)]">
          TerraNexis
        </h1>

        <p className="mt-4 text-xl md:text-2xl font-medium text-orange-400 tracking-wide">
          Your Mission. Your Route. Your Survival.
        </p>

        <p className="mt-4 max-w-2xl text-sm md:text-base leading-7 text-[#B7C7D8] bg-slate-950/40 backdrop-blur-sm p-4 rounded-xl border border-slate-800/60 shadow-xl">
          Explore the Red Planet with intelligence. Analyze Martian terrain, assess environmental
          risks, discover scientific opportunities, and plan safer routes for human exploration.
        </p>

        <div className="mt-8 flex flex-wrap items-center gap-4 pointer-events-auto">
          <Link
            to="/mission"
            className="group relative px-8 py-4 rounded-xl bg-gradient-to-r from-orange-600 to-amber-600 font-bold tracking-wider text-white shadow-2xl shadow-orange-600/40 hover:from-orange-500 hover:to-amber-500 transition-all duration-300 transform hover:-translate-y-0.5 flex items-center gap-3"
          >
            <span>ENTER MISSION CONTROL</span>
            <span className="transition-transform group-hover:translate-x-1">&rarr;</span>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 flex flex-col md:flex-row items-center justify-between px-8 py-6 md:px-16 text-xs text-slate-400 border-t border-slate-800/40 bg-slate-950/30 backdrop-blur-sm pointer-events-none">
        <p>Drag to rotate globe • Scroll to zoom in/out</p>
        <p className="font-mono text-orange-400/80 pointer-events-auto">
          [ SECURE ORBITAL LINK ACTIVE ]
        </p>
      </footer>
    </div>
  );
}
