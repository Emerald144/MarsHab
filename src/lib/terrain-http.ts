export type TerrainErrorKind = "connection" | "http" | "invalid-data" | "configuration";

export class TerrainApiError extends Error {
  constructor(
    public readonly kind: TerrainErrorKind,
    public readonly status?: number,
  ) {
    super(kind);
    this.name = "TerrainApiError";
  }
}

/** API base is an origin/optional deployment prefix; endpoint paths include /api/v1. */
export function terrainUrl(path: string, configuredBase = "", pageUrl?: string): string {
  const base = configuredBase.trim().replace(/\/+$/, "");
  if (base && !/^https?:\/\//.test(base) && !/^\/(?!\/)/.test(base)) {
    throw new TerrainApiError("configuration");
  }
  const url = `${base}${path}`;
  try {
    const page = new URL(pageUrl ?? "http://same-origin.invalid");
    const target = new URL(url, page);
    const configured = base ? new URL(base, page) : null;
    if (
      target.username ||
      target.password ||
      configured?.search ||
      configured?.hash ||
      target.hash ||
      (page.protocol === "https:" && target.protocol === "http:")
    ) {
      throw new TerrainApiError("configuration");
    }
  } catch {
    throw new TerrainApiError("configuration");
  }
  return url;
}

export async function terrainJson<T>(
  path: string,
  init: RequestInit,
  validate: (value: unknown) => boolean,
): Promise<T> {
  const url = terrainUrl(
    path,
    import.meta.env["VITE_API_BASE_URL"] ?? "",
    typeof window === "undefined" ? undefined : window.location.href,
  );
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120_000);
  try {
    let response: Response;
    try {
      response = await fetch(url, { ...init, signal: controller.signal });
    } catch {
      throw new TerrainApiError("connection");
    }
    if (!response.ok) throw new TerrainApiError("http", response.status);
    let data: unknown;
    try {
      data = await response.json();
    } catch {
      throw new TerrainApiError("invalid-data");
    }
    if (!validate(data)) throw new TerrainApiError("invalid-data");
    return data as T;
  } catch (error) {
    if (import.meta.env.DEV) {
      // No request bodies, credentials, query strings, or backend response text in logs.
      console.warn("[terrain-api]", {
        endpoint: path,
        target: new URL(url, "http://same-origin").origin,
        kind: error instanceof TerrainApiError ? error.kind : "unexpected",
        status: error instanceof TerrainApiError ? error.status : undefined,
      });
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export function terrainErrorMessage(error: unknown): string {
  if (!(error instanceof TerrainApiError)) return "The route request failed. Please retry.";
  if (error.kind === "configuration")
    return "The terrain API address is invalid or incompatible with this page. Check the deployment API configuration.";
  if (error.kind === "invalid-data")
    return "The terrain backend returned an invalid response. Check the API deployment and retry.";
  if (error.kind === "http") {
    if (error.status === 502 || error.status === 503 || error.status === 504)
      return "The terrain service is unavailable. Check that the backend is running, then retry.";
    if (error.status === 422)
      return "The terrain backend rejected the route settings. Check mission values and try again.";
    if (error.status === 404)
      return "The terrain API endpoint was not found. Check the API deployment address.";
    return "The terrain backend returned an HTTP error. Please retry.";
  }
  return "Could not connect to the terrain service. Check that the backend is running and reachable, then retry. The browser may also be blocking the connection.";
}
