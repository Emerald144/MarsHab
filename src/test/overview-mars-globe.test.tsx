import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OverviewMarsGlobe } from "@/components/mars/overview/OverviewMarsGlobe";

const graphics = vi.hoisted(() => ({
  failRenderer: false,
  failTexture: false,
  planet: undefined as import("three").Mesh | undefined,
  textures: [] as import("three").Texture[],
  renders: vi.fn(),
  dispose: vi.fn(),
  contextLoss: vi.fn(),
}));
vi.mock("three", async (importOriginal) => {
  const actual = await importOriginal<typeof import("three")>();
  return {
    ...actual,
    WebGLRenderer: class {
      domElement = document.createElement("canvas");
      capabilities = { getMaxAnisotropy: () => 8 };
      constructor() {
        if (graphics.failRenderer) throw Error("WebGL unavailable");
      }
      setPixelRatio() {}
      setClearColor() {}
      setSize() {}
      render(scene: import("three").Scene) {
        graphics.planet = scene.children.find(
          (child) =>
            child instanceof actual.Mesh && child.material instanceof actual.MeshStandardMaterial,
        ) as import("three").Mesh;
        graphics.renders();
      }
      dispose = graphics.dispose;
      forceContextLoss = graphics.contextLoss;
    },
    TextureLoader: class {
      async loadAsync() {
        if (graphics.failTexture) throw Error("Texture unavailable");
        const texture = new actual.Texture();
        vi.spyOn(texture, "dispose");
        graphics.textures.push(texture);
        return texture;
      }
    },
  };
});

describe("Overview Mars globe", () => {
  let frames: Map<number, FrameRequestCallback>;
  let nextFrame: number;
  let reduced: boolean;
  let hidden: boolean;
  let visibilityCallback: IntersectionObserverCallback;
  let observed: Element;
  let preferences: Set<() => void>;
  const disconnect = vi.fn();
  const flush = (time: number) => {
    const callbacks = [...frames.values()];
    frames.clear();
    act(() => callbacks.forEach((callback) => callback(time)));
  };
  const visible = (isIntersecting: boolean) =>
    act(() =>
      visibilityCallback(
        [{ target: observed, isIntersecting } as unknown as IntersectionObserverEntry],
        {} as IntersectionObserver,
      ),
    );
  const globe = () => screen.getByTestId("globe");
  const setup = async (paused = false) => {
    const result = render(<OverviewMarsGlobe paused={paused} data-testid="globe" />);
    visible(true);
    await waitFor(() => expect(globe()).toHaveAttribute("data-mars-renderer", "webgl"));
    return result;
  };

  beforeEach(() => {
    frames = new Map();
    nextFrame = 0;
    reduced = false;
    hidden = false;
    preferences = new Set();
    graphics.failRenderer = false;
    graphics.failTexture = false;
    graphics.planet = undefined;
    graphics.textures.length = 0;
    vi.clearAllMocks();
    vi.spyOn(document, "hidden", "get").mockImplementation(() => hidden);
    vi.stubGlobal("matchMedia", () => ({
      get matches() {
        return reduced;
      },
      addEventListener: (_event: string, callback: () => void) => preferences.add(callback),
      removeEventListener: (_event: string, callback: () => void) => preferences.delete(callback),
    }));
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      frames.set(++nextFrame, callback);
      return nextFrame;
    });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(callback: IntersectionObserverCallback) {
          visibilityCallback = callback;
        }
        observe(element: Element) {
          observed = element;
        }
        disconnect = disconnect;
      },
    );
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
    document.documentElement.removeAttribute("data-theme");
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("rotates the textured sphere around Y once per 90 seconds and connects Pause", async () => {
    const { rerender } = await setup();
    const initial = graphics.planet!.rotation.y;
    flush(0);
    flush(45000);
    expect(graphics.planet!.rotation.y).toBeCloseTo(initial + Math.PI);
    expect(graphics.planet!.rotation.x).toBe(0);
    flush(90000);
    expect(graphics.planet!.rotation.y).toBeCloseTo(initial);
    rerender(<OverviewMarsGlobe paused data-testid="globe" />);
    expect(frames.size).toBe(0);
    expect(globe()).toHaveAttribute("data-mars-motion", "still");
    const before = graphics.renders.mock.calls.length;
    flush(180000);
    expect(graphics.renders).toHaveBeenCalledTimes(before);
    rerender(<OverviewMarsGlobe paused={false} data-testid="globe" />);
    flush(200000);
    expect(graphics.planet!.rotation.y).toBeCloseTo(initial);
  });

  it("suspends rendering offscreen and in a hidden tab without jumping on resume", async () => {
    await setup();
    flush(0);
    flush(1000);
    const angle = graphics.planet!.rotation.y;
    visible(false);
    expect(frames.size).toBe(0);
    const before = graphics.renders.mock.calls.length;
    flush(100000);
    expect(graphics.renders).toHaveBeenCalledTimes(before);
    visible(true);
    flush(200000);
    expect(graphics.planet!.rotation.y).toBeCloseTo(angle);
    hidden = true;
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    expect(frames.size).toBe(0);
    expect(globe()).toHaveAttribute("data-mars-motion", "suspended");
    hidden = false;
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    flush(300000);
    expect(graphics.planet!.rotation.y).toBeCloseTo(angle);
  });

  it("updates theme lighting while paused without replacing the sphere or starting frames", async () => {
    await setup(true);
    const planet = graphics.planet!;
    const angle = planet.rotation.y;
    const material = planet.material as import("three").MeshStandardMaterial;
    expect(material.opacity).toBe(1);
    expect(material.map!.colorSpace).toBe("srgb");
    const ambient = planet.parent!.children.find((child) => child.type === "AmbientLight") as
      import("three").AmbientLight | undefined;
    const before = graphics.renders.mock.calls.length;
    document.documentElement.setAttribute("data-theme", "light");
    await waitFor(() => expect(ambient!.intensity).toBe(1.05));
    expect(graphics.renders.mock.calls.length).toBeGreaterThan(before);
    expect(graphics.planet).toBe(planet);
    expect(planet.rotation.y).toBe(angle);
    expect(frames.size).toBe(0);
    document.documentElement.setAttribute("data-theme", "dark");
    await waitFor(() => expect(ambient!.intensity).toBe(0.85));
    expect(planet.rotation.y).toBe(angle);
    expect(frames.size).toBe(0);
  });

  it("renders a still sphere for reduced motion and responds to preference changes", async () => {
    reduced = true;
    await setup();
    expect(graphics.renders).toHaveBeenCalledTimes(1);
    expect(frames.size).toBe(0);
    expect(globe()).toHaveAttribute("data-mars-motion", "still");
    reduced = false;
    act(() => preferences.forEach((callback) => callback()));
    expect(frames.size).toBe(1);
    reduced = true;
    // A frame can see the new preference before the media-query event arrives.
    flush(0);
    expect(frames.size).toBe(0);
    expect(globe()).toHaveAttribute("data-mars-motion", "still");
  });

  it.each(["renderer", "texture"])(
    "keeps the original static fallback on %s failure",
    async (failure) => {
      graphics.failRenderer = failure === "renderer";
      graphics.failTexture = failure === "texture";
      render(<OverviewMarsGlobe paused={false} data-testid="globe" />);
      visible(true);
      await waitFor(() => expect(globe()).toHaveAttribute("data-mars-renderer", "fallback"));
      expect(globe().querySelector("img")!.style.opacity).toBe("1");
      expect(globe().querySelector("canvas")).toBeNull();
      expect(frames.size).toBe(0);
    },
  );

  it("falls back on context loss and disposes textures, observers and frames", async () => {
    const { unmount } = await setup();
    const canvas = globe().querySelector("canvas")!;
    act(() => canvas.dispatchEvent(new Event("webglcontextlost", { cancelable: true })));
    expect(globe()).toHaveAttribute("data-mars-renderer", "fallback");
    expect(graphics.dispose).toHaveBeenCalledTimes(1);
    expect(graphics.contextLoss).toHaveBeenCalledTimes(1);
    graphics.textures.forEach((texture) => expect(texture.dispose).toHaveBeenCalledTimes(1));
    unmount();
    expect(disconnect).toHaveBeenCalledTimes(2);
    expect(preferences.size).toBe(0);
    expect(frames.size).toBe(0);
  });
});
