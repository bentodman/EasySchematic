import type { ConnectorType, SignalType, DeviceTemplate, Port } from "./types";

export interface SignalDefinition {
  id: SignalType;
  label: string;
  defaultColor: string;
  cableLabel: string;
  defaultConnectorId?: ConnectorType | null;
  isNetwork: boolean;
  isVideo: boolean;
}

export interface ConnectorDefinition {
  id: ConnectorType;
  label: string;
  cableLabel: string;
}

export interface ConnectorCompatibilityPair {
  connectorA: ConnectorType;
  connectorB: ConnectorType;
}

export interface CategoryDefinition {
  id: string;
  label: string;
  parentId: string | null;
  sortOrder: number;
}

const API_URL = (import.meta as any).env?.VITE_TEMPLATE_API_URL ?? "https://api.easyschematic.live";

/** Optional: set in .env for local dev so you don't type the token in the UI. Never set in production (exposed in bundle). */
const ENV_ADMIN_TOKEN = (import.meta as any).env?.VITE_ADMIN_TOKEN as string | undefined;

const ADMIN_TOKEN_KEY = "easyschematic_admin_token";

export function getAdminToken(): string | null {
  const fromEnv = ENV_ADMIN_TOKEN?.trim();
  if (fromEnv) return fromEnv;
  try {
    const fromStorage = localStorage.getItem(ADMIN_TOKEN_KEY);
    return fromStorage?.trim() || null;
  } catch {
    return null;
  }
}

/** True when the token is coming from .env (dev only). */
export function isAdminTokenFromEnv(): boolean {
  return !!ENV_ADMIN_TOKEN?.trim();
}

export function setAdminToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(ADMIN_TOKEN_KEY, token);
    else localStorage.removeItem(ADMIN_TOKEN_KEY);
  } catch {
    // ignore
  }
}

function authHeaders(): HeadersInit {
  const token = getAdminToken();
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

const UNAUTHORIZED_MESSAGE =
  "Unauthorized. Use the same value as ADMIN_TOKEN in api/.env — set it as VITE_ADMIN_TOKEN in this app's .env (and restart the app) or enter it in Library admin.";

export async function fetchSignals(): Promise<SignalDefinition[]> {
  const res = await fetch(`${API_URL}/signals`);
  if (!res.ok) throw new Error(`Failed to fetch signals: ${res.status}`);
  return res.json();
}

export async function fetchConnectors(): Promise<ConnectorDefinition[]> {
  const res = await fetch(`${API_URL}/connectors`);
  if (!res.ok) throw new Error(`Failed to fetch connectors: ${res.status}`);
  return res.json();
}

export async function fetchConnectorCompatibility(): Promise<ConnectorCompatibilityPair[]> {
  const res = await fetch(`${API_URL}/connector-compatibility`);
  if (!res.ok) throw new Error(`Failed to fetch connector compatibility: ${res.status}`);
  return res.json();
}

export async function fetchCategories(): Promise<CategoryDefinition[]> {
  const res = await fetch(`${API_URL}/categories`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to fetch categories: ${res.status}`);
  return res.json();
}

export async function fetchCategory(id: string): Promise<CategoryDefinition> {
  const res = await fetch(`${API_URL}/categories/${id}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to fetch category ${id}: ${res.status}`);
  return res.json();
}

export async function fetchLibraryRegistry() {
  const [signals, connectors, compatibility, categories] = await Promise.all([
    fetchSignals(),
    fetchConnectors(),
    fetchConnectorCompatibility(),
    fetchCategories(),
  ]);

  return {
    signals,
    connectors,
    compatibility,
    categories,
  };
}

// ─── Admin CRUD (require admin token) ─────────────────────────────

export async function createSignal(body: {
  id: string;
  label: string;
  defaultColor: string;
  cableLabel: string;
  defaultConnectorId?: string | null;
  isNetwork?: boolean;
  isVideo?: boolean;
}): Promise<SignalDefinition> {
  const res = await fetch(`${API_URL}/signals`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(res.status === 401 ? UNAUTHORIZED_MESSAGE : (err as { error?: string }).error ?? `Failed to create signal: ${res.status}`);
  }
  return res.json();
}

export async function updateSignal(
  id: string,
  body: {
    label: string;
    defaultColor: string;
    cableLabel: string;
    defaultConnectorId?: string | null;
    isNetwork?: boolean;
    isVideo?: boolean;
  }
): Promise<SignalDefinition> {
  const res = await fetch(`${API_URL}/signals/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(res.status === 401 ? UNAUTHORIZED_MESSAGE : (err as { error?: string }).error ?? `Failed to update signal: ${res.status}`);
  }
  return res.json();
}

export async function deleteSignal(id: string): Promise<void> {
  const res = await fetch(`${API_URL}/signals/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(res.status === 401 ? UNAUTHORIZED_MESSAGE : (err as { error?: string }).error ?? `Failed to delete signal: ${res.status}`);
  }
}

export async function createConnector(body: {
  id: string;
  label: string;
  cableLabel: string;
}): Promise<ConnectorDefinition> {
  const res = await fetch(`${API_URL}/connectors`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(res.status === 401 ? UNAUTHORIZED_MESSAGE : (err as { error?: string }).error ?? `Failed to create connector: ${res.status}`);
  }
  return res.json();
}

export async function updateConnector(
  id: string,
  body: { label: string; cableLabel: string }
): Promise<ConnectorDefinition> {
  const res = await fetch(`${API_URL}/connectors/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(res.status === 401 ? UNAUTHORIZED_MESSAGE : (err as { error?: string }).error ?? `Failed to update connector: ${res.status}`);
  }
  return res.json();
}

export async function deleteConnector(id: string): Promise<void> {
  const res = await fetch(`${API_URL}/connectors/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(res.status === 401 ? UNAUTHORIZED_MESSAGE : (err as { error?: string }).error ?? `Failed to delete connector: ${res.status}`);
  }
}

export async function putConnectorCompatibility(pairs: ConnectorCompatibilityPair[]): Promise<void> {
  const res = await fetch(`${API_URL}/connector-compatibility`, {
    method: "PUT",
    headers: authHeaders(),
    body: JSON.stringify({ pairs }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(res.status === 401 ? UNAUTHORIZED_MESSAGE : (err as { error?: string }).error ?? `Failed to update compatibility: ${res.status}`);
  }
}

export async function createCategory(body: {
  label: string;
  parentId?: string | null;
  sortOrder?: number;
}): Promise<CategoryDefinition> {
  const res = await fetch(`${API_URL}/categories`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(res.status === 401 ? UNAUTHORIZED_MESSAGE : (err as { error?: string }).error ?? `Failed to create category: ${res.status}`);
  }
  return res.json();
}

export async function updateCategory(
  id: string,
  body: { label?: string; parentId?: string | null; sortOrder?: number }
): Promise<void> {
  const res = await fetch(`${API_URL}/categories/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(res.status === 401 ? UNAUTHORIZED_MESSAGE : (err as { error?: string }).error ?? `Failed to update category: ${res.status}`);
  }
}

export async function deleteCategory(id: string): Promise<void> {
  const res = await fetch(`${API_URL}/categories/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(res.status === 401 ? UNAUTHORIZED_MESSAGE : (err as { error?: string }).error ?? `Failed to delete category: ${res.status}`);
  }
}

// ─── Template (device) CRUD (require admin token) ─────────────────────────

export type TemplatePayload = {
  label: string;
  deviceType: string;
  ports: Port[];
  manufacturer?: string;
  modelNumber?: string;
  color?: string;
  imageUrl?: string;
  referenceUrl?: string;
  searchTerms?: string[];
  sortOrder?: number;
  categoryId?: string | null;
};

export async function fetchTemplatesAdmin(): Promise<DeviceTemplate[]> {
  const res = await fetch(`${API_URL}/templates`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to fetch templates: ${res.status}`);
  return res.json();
}

export async function createTemplate(payload: TemplatePayload): Promise<DeviceTemplate> {
  const res = await fetch(`${API_URL}/templates`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(res.status === 401 ? UNAUTHORIZED_MESSAGE : (err as { error?: string }).error ?? `Failed to create template: ${res.status}`);
  }
  return res.json();
}

export async function updateTemplate(id: string, payload: TemplatePayload): Promise<DeviceTemplate> {
  const res = await fetch(`${API_URL}/templates/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(res.status === 401 ? UNAUTHORIZED_MESSAGE : (err as { error?: string }).error ?? `Failed to update template: ${res.status}`);
  }
  return res.json();
}

export async function deleteTemplate(id: string): Promise<void> {
  const res = await fetch(`${API_URL}/templates/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(res.status === 401 ? UNAUTHORIZED_MESSAGE : (err as { error?: string }).error ?? `Failed to delete template: ${res.status}`);
  }
}
