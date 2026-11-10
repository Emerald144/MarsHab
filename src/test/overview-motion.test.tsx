import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useOverviewMotion } from "@/hooks/use-overview-motion";

describe("Overview scroll motion", () => {
  let frames: Map<number, FrameRequestCallback>;
  let id: number;
  let reduced: boolean;
  let desktop: boolean;
  let renders: number;
  let preferenceListeners: Set<() => void>;
  const disconnect = vi.fn();

  function Fixture({ paused = false }: { paused?: boolean }) {
    const ref = useOverviewMotion(paused);
    renders++;
    return (
      <div ref={ref} data-testid="root">
        <section data-testid="layer" data-overview-depth="12" data-overview-spread="3">
          <button>Map action</button>
        </section>
      </div>
    );
  }

  const flush = () => {
    const pending = [...frames.values()];
    frames.clear();
    act(() => pending.forEach((callback) => callback(0)));
  };

  beforeEach(() => {
    frames = new Map();
    id = 0;
    renders = 0;
    reduced = false;
    desktop = true;
    preferenceListeners = new Set();
    vi.clearAllMocks();
    vi.stubGlobal("innerHeight", 800);
    vi.stubGlobal("scrollY", 0);
    vi.spyOn(HTMLElement.prototype, "offsetTop", "get").mockReturnValue(100);
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(200);
    vi.stubGlobal("matchMedia", (query: string) => ({
      get matches() {
        return query.includes("reduced-motion") ? reduced : desktop;
      },
      addEventListener: (_event: string, listener: () => void) => preferenceListeners.add(listener),
      removeEventListener: (_event: string, listener: () => void) =>
        preferenceListeners.delete(listener),
    }));
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      frames.set(++id, callback);
      return id;
    });
    vi.stubGlobal("cancelAnimationFrame", (frame: number) => frames.delete(frame));
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        disconnect = disconnect;
      },
    );
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("batches scroll updates, bounds the depth, and never re-renders for scroll", () => {
    const { unmount } = render(<Fixture />);
    flush();
    const layer = screen.getByTestId("layer");
    expect(layer.style.getPropertyValue("--overview-scroll-y")).toBe("4.80px");
    vi.stubGlobal("scrollY", 5000);
    fireEvent.scroll(window);
    fireEvent.scroll(window);
    fireEvent.scroll(window);
    expect(frames.size).toBe(1);
    flush();
    expect(layer.style.getPropertyValue("--overview-scroll-y")).toBe("12.00px");
    expect(layer.style.getPropertyValue("--overview-scroll-x")).toBe("3.00px");
    expect(renders).toBe(1);
    fireEvent.scroll(window);
    unmount();
    expect(frames.size).toBe(0);
    expect(disconnect).toHaveBeenCalled();
    expect(preferenceListeners.size).toBe(0);
  });

  it("clears parallax when reduced motion is enabled", () => {
    render(<Fixture />);
    flush();
    const layer = screen.getByTestId("layer");
    reduced = true;
    act(() => preferenceListeners.forEach((listener) => listener()));
    expect(screen.getByTestId("root")).not.toHaveAttribute("data-overview-motion");
    expect(layer).not.toHaveAttribute("data-overview-pending");
    expect(layer.style.getPropertyValue("--overview-scroll-y")).toBe("");
    expect(frames.size).toBe(0);
  });

  it("pauses and resumes without hiding content again or retaining scroll listeners", () => {
    const { rerender } = render(<Fixture />);
    flush();
    rerender(<Fixture paused />);
    expect(frames.size).toBe(0);
    expect(screen.getByTestId("root")).not.toHaveAttribute("data-overview-motion");
    fireEvent.scroll(window);
    expect(frames.size).toBe(0);
    rerender(<Fixture />);
    expect(screen.getByTestId("layer")).not.toHaveAttribute("data-overview-pending");
  });

  it("leaves mobile content free of parallax and unsupported browsers visible", () => {
    desktop = false;
    const { unmount } = render(<Fixture />);
    expect(frames.size).toBe(0);
    fireEvent.scroll(window);
    expect(frames.size).toBe(0);
    unmount();
    vi.stubGlobal("IntersectionObserver", undefined);
    render(<Fixture />);
    expect(screen.getByTestId("layer")).not.toHaveAttribute("data-overview-pending");
    expect(screen.getByRole("button", { name: "Map action" })).toBeEnabled();
  });
});
