import type { DeviceTemplate } from "./types";

const API_URL =
  import.meta.env.VITE_TEMPLATE_API_URL ?? "https://api.easyschematic.live";

let cached: DeviceTemplate[] | null = null;

/** Synchronous access for UI that needs templates before async fetch completes. */
export function getCachedTemplates(): DeviceTemplate[] {
  return cached ?? [];
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
