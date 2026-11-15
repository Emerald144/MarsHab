// Local-only launcher; the hosted/Lovable `dev` command remains unchanged.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const root = fileURLToPath(new URL("../", import.meta.url));
process.chdir(root);
if (existsSync(".env")) process.loadEnvFile(".env");
const children = new Set();
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill();
  process.exitCode = code;
}
process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());
function launch(command, args) {
  const child = spawn(command, args, { cwd: root, stdio: "inherit", windowsHide: true });
  children.add(child);
  child.on("error", (error) => { console.error(error.message); stop(1); });
  child.on("exit", (code) => { children.delete(child); if (!stopping) stop(code ?? 1); });
  return child;
}
async function healthy() {
  try {
    const response = await fetch("http://127.0.0.1:8000/api/v1/health", { signal: AbortSignal.timeout(1000) });
    const data = await response.json();
    return response.ok && data.service === "jezero-terrain-planning" && data.status === "ok";
  } catch { return false; }
}
try {
  if (await healthy()) {
    console.log("Using the running terrain backend on port 8000.");
  } else {
    const executable = process.platform === "win32" ? "Scripts/python.exe" : "bin/python";
    const python = [".venv", "backend/.venv", "venv"].map((folder) => join(root, folder, executable)).find(existsSync);
    if (!python) throw new Error("No project Python environment found. Follow docs/local-setup.md to install backend/requirements-dev.txt.");
    launch(python, ["-m", "uvicorn", "app.main:app", "--app-dir", "backend", "--host", "127.0.0.1", "--port", "8000"]);
    let ready = false;
    const deadline = Date.now() + 90_000;
    while (Date.now() < deadline && !stopping) {
      if (await healthy()) { ready = true; break; }
      await delay(300);
    }
    if (!ready) throw new Error("Terrain backend did not start. Check the Python startup error above.");
  }
  if (!stopping && !process.argv.includes("--api-only")) {
    launch(process.execPath, [join(root, "node_modules/vite/bin/vite.js"), "--host", "127.0.0.1", "--port", "8080", "--strictPort", ...process.argv.slice(2)]);
  }
} catch (error) {
  console.error(error.message);
  stop(1);
}
