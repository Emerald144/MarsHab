import { act, renderHook, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useMissionApproach } from "@/hooks/use-mission-approach";

describe("mission approach lifecycle", () => {
  let frames: Map<number, FrameRequestCallback>;
  let nextId: number;
  let reduce: boolean;

  const advance = (time: number) => {
    const pending = [...frames.values()];
    frames.clear();
    act(() => pending.forEach((callback) => callback(time)));
  };

  beforeEach(() => {
    frames = new Map();
    nextId = 0;
    reduce = false;
    vi.spyOn(performance, "now").mockReturnValue(0);
    vi.stubGlobal("matchMedia", () => ({
      get matches() {
        return reduce;
      },
    }));
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      frames.set(++nextId, callback);
      return nextId;
    });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("ignores repeated starts and completes only once after the cinematic", () => {
    const complete = vi.fn();
    const { result } = renderHook(() => useMissionApproach(complete));
    act(() => {
      result.current.start();
      result.current.start();
    });
    expect(frames.size).toBe(1);
    advance(2100);
    expect(result.current.progress).toBe(0.5);
    expect(complete).not.toHaveBeenCalled();
    advance(4200);
    advance(5000);
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it("uses a short fade when reduced motion is preferred", () => {
    reduce = true;
    const complete = vi.fn();
    const { result } = renderHook(() => useMissionApproach(complete));
    act(() => result.current.start());
    expect(result.current.reducedMotion).toBe(true);
    advance(350);
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it("honors reduced motion enabled during the approach without restarting", () => {
    const complete = vi.fn();
    const { result } = renderHook(() => useMissionApproach(complete));
    act(() => result.current.start());
    advance(1000);
    reduce = true;
    advance(1100);
    expect(result.current.reducedMotion).toBe(true);
    expect(complete).toHaveBeenCalledTimes(1);
    expect(frames.size).toBe(0);
  });

  it("cancels pending navigation when unmounted during the approach", () => {
    const complete = vi.fn();
    const { result, unmount } = renderHook(() => useMissionApproach(complete));
    act(() => result.current.start());
    advance(1000);
    unmount();
    advance(5000);
    expect(complete).not.toHaveBeenCalled();
    expect(frames.size).toBe(0);
  });
});
