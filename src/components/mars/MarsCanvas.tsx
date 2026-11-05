import { useEffect, useRef } from "react";
import { initMarsScene } from "./engine/main.js"; // Adjust path if needed

export function MarsCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // Initialize the Three.js scene and get the cleanup function
    const cleanup = initMarsScene(containerRef.current);

    // Clean up event listeners, renderers, and animation frames on unmount
    return () => {
      if (cleanup) cleanup();
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="pointer-events-auto absolute inset-0 z-0 h-full w-full overflow-hidden"
    />
  );
}
