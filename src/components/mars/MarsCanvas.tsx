import { useEffect, useRef } from "react";
import { initMarsScene } from "./engine/main.js"; // Adjust path if needed

export function MarsCanvas({ approach = 0 }: { approach?: number }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<ReturnType<typeof initMarsScene> | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // Initialize the Three.js scene and get the cleanup function
    const cleanup = initMarsScene(containerRef.current);
    sceneRef.current = cleanup;

    // Clean up event listeners, renderers, and animation frames on unmount
    return () => {
      sceneRef.current = null;
      if (cleanup) cleanup();
    };
  }, []);

  useEffect(() => {
    sceneRef.current?.setApproach(approach);
  }, [approach]);

  return (
    <div
      ref={containerRef}
      className="pointer-events-auto absolute inset-0 z-0 h-full w-full overflow-hidden"
    />
  );
}
