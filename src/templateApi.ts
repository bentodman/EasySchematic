import type { DeviceTemplate } from "./types";
import fallbackData from "./deviceLibrary.fallback.json";

const API_URL =
  import.meta.env.VITE_TEMPLATE_API_URL ?? "https://api.easyschematic.live";

/** When true, do not use the bundled community library (use only your self-hosted API). */
export const DISABLE_BUNDLED_LIBRARY =
  import.meta.env.VITE_DISABLE_BUNDLED_LIBRARY === "true" || import.meta.env.VITE_DISABLE_BUNDLED_LIBRARY === "1";

let cached: DeviceTemplate[] | null = null;

export function getBundledTemplates(): DeviceTemplate[] {
  if (DISABLE_BUNDLED_LIBRARY) return [];
  return fallbackData as DeviceTemplate[];
}

/** Clear cached template list so next fetchTemplates() hits the API. Call after create/update/delete in Library admin. */
export function clearTemplateCache(): void {
  cached = null;
}

export async function fetchTemplates(): Promise<DeviceTemplate[]> {
  if (cached) return cached;

  // Bypass HTTP/browser caching so template edits from Library admin
  // always reflect immediately (sidebar/table + canvas refresh).
  const res = await fetch(`${API_URL}/templates`, { cache: "no-store" });
  if (!res.ok) throw new Error(`API ${res.status}`);
  const data = (await res.json()) as DeviceTemplate[];
  cached = data;
  return data;
}
