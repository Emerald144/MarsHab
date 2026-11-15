// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { loadEnv } from "vite";

const backendEnv = loadEnv(process.env["NODE_ENV"] ?? "development", process.cwd(), "TERRANEXIS_");

export default defineConfig({
  vite: {
    server: {
      proxy: {
        // Mission, science and MEDA requests stay on the browser's own origin.
        "/api": {
          target:
            process.env["TERRANEXIS_API_PROXY_TARGET"] ??
            backendEnv["TERRANEXIS_API_PROXY_TARGET"] ??
            "http://127.0.0.1:8000",
          changeOrigin: true,
          configure(proxy) {
            proxy.on("error", (_error, _request, response) => {
              if ("writeHead" in response && !response.headersSent) {
                response.writeHead(503, { "Content-Type": "application/json" });
                response.end(JSON.stringify({ detail: "Terrain backend is unavailable. Start npm run dev:local." }));
              }
            });
          },
        },
      },
    },
  },
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});
