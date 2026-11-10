import { useEffect, useRef, useState, type HTMLAttributes } from "react";
import type * as THREE from "three";
import fallbackMars from "@/assets/mars-globe.jpg";
import marsColor from "@/assets/mars/mars-color.jpg";
import marsBump from "@/assets/mars/mars-bump.jpg";

interface OverviewMarsGlobeProps extends HTMLAttributes<HTMLDivElement> {
  paused: boolean;
}

/** Decorative, non-interactive sphere. Rendering runs only while it is visible. */
export function OverviewMarsGlobe({ paused, className = "", ...props }: OverviewMarsGlobeProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const pausedRef = useRef(paused);
  const synchronizeRef = useRef<(() => void) | null>(null);
  const [status, setStatus] = useState<"loading" | "webgl" | "fallback">("loading");
  pausedRef.current = paused;

  useEffect(() => {
    synchronizeRef.current?.();
  }, [paused]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    let disposed = false;
    let failed = false;
    let visible = typeof IntersectionObserver === "undefined";
    let ready = false;
    let firstRender = true;
    let dirty = true;
    let frame: number | null = null;
    let lastTime: number | null = null;
    let renderer: THREE.WebGLRenderer | undefined;
    let scene: THREE.Scene | undefined;
    let camera: THREE.OrthographicCamera | undefined;
    let planet: THREE.Mesh | undefined;
    let ambient: THREE.AmbientLight | undefined;
    let sun: THREE.DirectionalLight | undefined;
    let fill: THREE.DirectionalLight | undefined;
    let atmosphere: THREE.ShaderMaterial | undefined;
    const textures = new Set<THREE.Texture>();
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();

    const cancel = () => {
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
      lastTime = null;
    };
    const canDraw = () => !disposed && !failed && ready && visible && !document.hidden;
    const canRotate = () => canDraw() && !pausedRef.current && !reduced.matches;
    const releaseGraphics = () => {
      geometries.forEach((item) => item.dispose());
      geometries.clear();
      materials.forEach((item) => item.dispose());
      materials.clear();
      textures.forEach((item) => item.dispose());
      textures.clear();
      if (renderer) {
        renderer.domElement.removeEventListener("webglcontextlost", contextLost);
        renderer.dispose();
        renderer.forceContextLoss();
        renderer.domElement.remove();
        renderer = undefined;
      }
    };
    const fallback = () => {
      if (disposed || failed) return;
      failed = true;
      cancel();
      container.dataset["marsMotion"] = "suspended";
      releaseGraphics();
      setStatus("fallback");
    };
    function contextLost(event: Event) {
      event.preventDefault();
      fallback();
    }
    const draw = () => {
      if (!canDraw() || !renderer || !scene || !camera) return;
      try {
        renderer.render(scene, camera);
        dirty = false;
        if (firstRender) {
          firstRender = false;
          setStatus("webgl");
        }
      } catch {
        fallback();
      }
    };
    const tick = (time: number) => {
      frame = null;
      if (!canRotate()) {
        synchronize();
        return;
      }
      if (planet && lastTime !== null) {
        // One full surface revolution per 90 seconds of active rendering.
        planet.rotation.y =
          (planet.rotation.y + (Math.max(0, time - lastTime) * Math.PI * 2) / 90000) %
          (Math.PI * 2);
      }
      lastTime = time;
      draw();
      if (canRotate()) frame = requestAnimationFrame(tick);
    };
    const synchronize = () => {
      if (!canRotate()) {
        cancel();
        container.dataset["marsMotion"] = canDraw() ? "still" : "suspended";
        if (canDraw() && dirty) draw();
        return;
      }
      container.dataset["marsMotion"] = "rotating";
      if (dirty) draw();
      if (frame === null && canRotate()) frame = requestAnimationFrame(tick);
    };
    synchronizeRef.current = synchronize;

    // Observe the existing theme attribute without recreating the scene or rotation clock.
    const updateTheme = () => {
      const light = document.documentElement.dataset["theme"] === "light";
      if (ambient) ambient.intensity = light ? 1.05 : 0.85;
      if (sun) sun.intensity = light ? 2.6 : 2.8;
      if (fill) fill.intensity = light ? 0.65 : 0.45;
      if (atmosphere) atmosphere.uniforms["rimStrength"]!.value = light ? 0.18 : 0.25;
      dirty = true;
      synchronize();
    };
    const themeObserver = new MutationObserver(updateTheme);
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });

    const resize = () => {
      if (disposed || failed || !renderer || !camera) return;
      const width = container.clientWidth || 640;
      const height = container.clientHeight || 640;
      const aspect = width / height;
      camera.left = -1.1 * aspect;
      camera.right = 1.1 * aspect;
      camera.top = 1.1;
      camera.bottom = -1.1;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
      dirty = true;
      synchronize();
    };
    const intersection =
      typeof IntersectionObserver === "undefined"
        ? null
        : new IntersectionObserver(
            (entries) => {
              const entry = entries.find((item) => item.target === container);
              if (!entry) return;
              visible = entry.isIntersecting;
              synchronize();
            },
            { threshold: 0 },
          );
    intersection?.observe(container);
    const resizeObserver =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(resize);
    resizeObserver?.observe(container);
    if (!resizeObserver) window.addEventListener("resize", resize);
    document.addEventListener("visibilitychange", synchronize);
    reduced.addEventListener("change", synchronize);

    // Keep the fallback visible throughout loading or any partial initialization failure.
    void import("three")
      .then(async (three) => {
        if (disposed || failed) return;
        try {
          renderer = new three.WebGLRenderer({
            alpha: true,
            antialias: true,
            powerPreference: "low-power",
          });
          renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
          renderer.setClearColor(0x000000, 0);
          renderer.outputColorSpace = three.SRGBColorSpace;
          renderer.toneMapping = three.ACESFilmicToneMapping;
          renderer.toneMappingExposure = 1.1;
          renderer.domElement.className = "pointer-events-none absolute inset-0 h-full w-full";
          renderer.domElement.setAttribute("aria-hidden", "true");
          renderer.domElement.addEventListener("webglcontextlost", contextLost);
          container.appendChild(renderer.domElement);
          scene = new three.Scene();
          camera = new three.OrthographicCamera(-1.1, 1.1, 1.1, -1.1, 0.1, 10);
          camera.position.set(0, 0, 4);

          const loader = new three.TextureLoader();
          const load = async (url: string) => {
            const texture = await loader.loadAsync(url);
            if (disposed || failed) texture.dispose();
            else textures.add(texture);
            return texture;
          };
          const [color, bump] = await Promise.all([load(marsColor), load(marsBump)]);
          if (disposed || failed || !renderer || !scene) return;
          color.colorSpace = three.SRGBColorSpace;
          color.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
          const geometry = new three.SphereGeometry(1, 96, 64);
          geometries.add(geometry);
          const material = new three.MeshStandardMaterial({
            map: color,
            bumpMap: bump,
            bumpScale: 0.006,
            roughness: 0.98,
            metalness: 0,
          });
          materials.add(material);
          planet = new three.Mesh(geometry, material);
          planet.rotation.y = 0.55;
          scene.add(planet);
          ambient = new three.AmbientLight(0xffffff, 0.85);
          scene.add(ambient);
          sun = new three.DirectionalLight(0xffeee0, 2.8);
          sun.position.set(-3, 2, 4);
          scene.add(sun);
          fill = new three.DirectionalLight(0xdce8ff, 0.45);
          fill.position.set(3, 0.5, 1);
          scene.add(fill);

          const atmosphereGeometry = new three.SphereGeometry(1.025, 64, 48);
          geometries.add(atmosphereGeometry);
          const atmosphereMaterial = new three.ShaderMaterial({
            uniforms: {
              glowColor: { value: new three.Color(0x5080ff) },
              rimStrength: { value: 0.25 },
            },
            vertexShader: `varying vec3 globeNormal; varying vec3 viewDirection;
            void main() {
              vec4 positionInView = modelViewMatrix * vec4(position, 1.0);
              globeNormal = normalize(normalMatrix * normal);
              viewDirection = normalize(-positionInView.xyz);
              gl_Position = projectionMatrix * positionInView;
            }`,
            fragmentShader: `uniform vec3 glowColor; uniform float rimStrength; varying vec3 globeNormal; varying vec3 viewDirection;
            void main() {
              float rim = pow(1.0 - abs(dot(normalize(globeNormal), normalize(viewDirection))), 3.5);
              gl_FragColor = vec4(glowColor, rim * rimStrength);
            }`,
            transparent: true,
            blending: three.AdditiveBlending,
            depthWrite: false,
          });
          materials.add(atmosphereMaterial);
          atmosphere = atmosphereMaterial;
          scene.add(new three.Mesh(atmosphereGeometry, atmosphereMaterial));
          updateTheme();
          ready = true;
          resize();
        } catch {
          fallback();
        }
      })
      .catch(fallback);

    return () => {
      disposed = true;
      cancel();
      synchronizeRef.current = null;
      intersection?.disconnect();
      themeObserver.disconnect();
      resizeObserver?.disconnect();
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", synchronize);
      reduced.removeEventListener("change", synchronize);
      releaseGraphics();
    };
  }, []);

  return (
    <div
      {...props}
      ref={containerRef}
      aria-hidden="true"
      data-mars-renderer={status}
      className={`pointer-events-none relative ${className}`}
    >
      <img
        src={fallbackMars}
        alt=""
        width={1024}
        height={1024}
        className="pointer-events-none absolute inset-0 h-full w-full"
        style={{ opacity: status === "webgl" ? 0 : 1 }}
      />
    </div>
  );
}
