import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AnimatedContent from "@/components/animations/AnimatedContent";

const engine = vi.hoisted(() => ({
  triggers: [] as { options: Record<string, unknown>; kill: ReturnType<typeof vi.fn> }[],
  timelines: [] as {
    options: Record<string, () => void>;
    play: ReturnType<typeof vi.fn>;
    reverse: ReturnType<typeof vi.fn>;
    fromTo: ReturnType<typeof vi.fn>;
  }[],
  contexts: [] as { revert: ReturnType<typeof vi.fn> }[],
  fail: false,
}));
vi.mock("gsap", () => ({
  gsap: {
    registerPlugin: vi.fn(),
    context: vi.fn(() => {
      const context = { add: (callback: () => void) => callback(), revert: vi.fn() };
      engine.contexts.push(context);
      return context;
    }),
    timeline: vi.fn((options: Record<string, () => void>) => {
      const timeline = {
        options,
        play: vi.fn(),
        reverse: vi.fn(),
        fromTo: vi.fn((targets: HTMLElement[], from: Record<string, unknown>) => {
          targets.forEach((target) => {
            target.style.opacity = String(from["opacity"]);
            target.style.transform = "translateY(40px)";
            target.style.filter = String(from["filter"] ?? "none");
          });
        }),
      };
      engine.timelines.push(timeline);
      return timeline;
    }),
    set: vi.fn(),
    to: vi.fn(),
  },
}));
vi.mock("gsap/ScrollTrigger", () => ({
  ScrollTrigger: {
    create: vi.fn((options: Record<string, unknown>) => {
      if (engine.fail) throw Error("ScrollTrigger unavailable");
      const trigger = { options, kill: vi.fn() };
      engine.triggers.push(trigger);
      return trigger;
    }),
  },
}));

describe("AnimatedContent accessibility and lifecycle", () => {
  let reduced: boolean;
  let mobile: boolean;
  let listeners: Set<() => void>;
  beforeEach(() => {
    reduced = false;
    mobile = false;
    listeners = new Set();
    engine.triggers.length = 0;
    engine.timelines.length = 0;
    engine.contexts.length = 0;
    engine.fail = false;
    vi.clearAllMocks();
    vi.stubGlobal("matchMedia", (query: string) => ({
      get matches() {
        return query.includes("reduced-motion") ? reduced : mobile;
      },
      addEventListener: (_event: string, callback: () => void) => listeners.add(callback),
      removeEventListener: (_event: string, callback: () => void) => listeners.delete(callback),
    }));
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("uses window scrolling and releases its context on unmount", async () => {
    const { unmount } = render(
      <AnimatedContent data-testid="box">
        <button>Plan</button>
      </AnimatedContent>,
    );
    expect(screen.getByTestId("box").style.visibility).not.toBe("hidden");
    await waitFor(() => expect(engine.triggers).toHaveLength(1));
    expect(engine.triggers[0]!.options["scroller"]).toBeUndefined();
    expect(engine.triggers[0]!.options["start"]).toBe("top 90%");
    unmount();
    expect(engine.contexts[0]!.revert).toHaveBeenCalled();
    expect(listeners.size).toBe(0);
  });

  it("Pause exposes offscreen children immediately and Resume does not hide them again", async () => {
    const content = (
      <>
        <div>First card</div>
        <div>Offscreen card</div>
      </>
    );
    const { rerender } = render(
      <AnimatedContent stagger={0.1} data-testid="box">
        {content}
      </AnimatedContent>,
    );
    await waitFor(() => expect(engine.triggers).toHaveLength(1));
    const cards = Array.from(screen.getByTestId("box").children) as HTMLElement[];
    expect(cards.every((card) => card.style.opacity === "0")).toBe(true);
    rerender(
      <AnimatedContent paused stagger={0.1} data-testid="box">
        {content}
      </AnimatedContent>,
    );
    expect(
      cards.every(
        (card) =>
          card.style.opacity === "" && card.style.transform === "" && card.style.filter === "",
      ),
    ).toBe(true);
    rerender(
      <AnimatedContent stagger={0.1} data-testid="box">
        {content}
      </AnimatedContent>,
    );
    expect(cards.every((card) => card.style.opacity !== "0")).toBe(true);
    expect(engine.triggers).toHaveLength(1);
  });

  it("restores visible content if initialization partially fails", async () => {
    engine.fail = true;
    vi.spyOn(console, "warn").mockImplementation(() => {});
    render(<AnimatedContent data-testid="box">Mission information</AnimatedContent>);
    await waitFor(() =>
      expect(screen.getByTestId("box")).toHaveAttribute("data-animated-content-status", "fallback"),
    );
    expect(screen.getByTestId("box").style.opacity).not.toBe("0");
    expect(screen.getByTestId("box").style.transform).toBe("");
    expect(engine.contexts[0]!.revert).toHaveBeenCalled();
  });

  it("reveals focused content and responds to reduced motion without scroll renders", async () => {
    render(
      <AnimatedContent data-testid="box">
        <button>Plan</button>
      </AnimatedContent>,
    );
    await waitFor(() => expect(engine.triggers).toHaveLength(1));
    fireEvent.focusIn(screen.getByRole("button", { name: "Plan" }));
    expect(screen.getByTestId("box").style.opacity).not.toBe("0");
    expect(screen.getByTestId("box")).toHaveAttribute("data-animated-content-status", "focused");
    reduced = true;
    listeners.forEach((listener) => listener());
    expect(screen.getByTestId("box")).toHaveAttribute("data-animated-content-status", "reduced");
  });

  it("skips animation for initial reduced motion and cancels asynchronous setup after unmount", async () => {
    reduced = true;
    const first = render(<AnimatedContent data-testid="box">Mission</AnimatedContent>);
    expect(screen.getByTestId("box")).toHaveAttribute("data-animated-content-status", "reduced");
    expect(engine.triggers).toHaveLength(0);
    first.unmount();
    reduced = false;
    const second = render(<AnimatedContent>Mission</AnimatedContent>);
    second.unmount();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(engine.triggers).toHaveLength(0);
  });

  it("reduces travel on mobile and accepts an explicit custom scroller without global changes", async () => {
    mobile = true;
    render(
      <div id="local-scroll">
        <AnimatedContent container="#local-scroll" distance={50}>
          Mission
        </AnimatedContent>
      </div>,
    );
    await waitFor(() => expect(engine.triggers).toHaveLength(1));
    expect(engine.triggers[0]!.options["scroller"]).toBe(document.getElementById("local-scroll"));
    expect(engine.timelines[0]!.fromTo.mock.calls[0]![1]["y"]).toBe(20);
  });
});
