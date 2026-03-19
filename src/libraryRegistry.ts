import { create } from "zustand";
import type { ConnectorType, SignalType } from "./types";
import { SIGNAL_COLORS, SIGNAL_LABELS, CONNECTOR_LABELS } from "./types";
import { applySignalColors, loadSignalColors } from "./signalColors";
import { CONNECTOR_COMPAT_GROUPS, NETWORK_SIGNAL_TYPES, VIDEO_SIGNAL_TYPES } from "./connectorTypes";
import {
  fetchLibraryRegistry,
  type CategoryDefinition,
  type ConnectorCompatibilityPair,
  type ConnectorDefinition,
  type SignalDefinition,
} from "./libraryApi";

type ConnectorCompatKey = string;

function compatKey(a: ConnectorType, b: ConnectorType): ConnectorCompatKey {
  return a <= b ? `${a}|${b}` : `${b}|${a}`;
}

interface LibraryRegistryState {
  loaded: boolean;
  loading: boolean;
  error: string | null;

  signalsById: Record<string, SignalDefinition>;
  connectorsById: Record<string, ConnectorDefinition>;
  categories: CategoryDefinition[];
  connectorCompatKeys: Set<ConnectorCompatKey>;

  // Fetch and apply runtime definitions.
  refresh: () => Promise<void>;
}

export const useLibraryRegistryStore = create<LibraryRegistryState>((set, get) => ({
  loaded: false,
  loading: false,
  error: null,
  signalsById: {},
  connectorsById: {},
  categories: [],
  connectorCompatKeys: new Set<ConnectorCompatKey>(),

  refresh: async () => {
    if (get().loading) return;
    set({ loading: true, error: null });

    try {
      const registry = await fetchLibraryRegistry();

      const signalsById: Record<string, SignalDefinition> = {};
      for (const s of registry.signals) signalsById[s.id] = s;

      const connectorsById: Record<string, ConnectorDefinition> = {};
      for (const c of registry.connectors) connectorsById[c.id] = c;

      const connectorCompatKeys = new Set<ConnectorCompatKey>();
      for (const p of registry.compatibility as ConnectorCompatibilityPair[]) {
        connectorCompatKeys.add(compatKey(p.connectorA, p.connectorB));
      }

      // Apply signal default colors so edge strokes (CSS vars) work for runtime/custom signal IDs.
      const registrySignalColors: Record<string, string> = {};
      for (const s of registry.signals) {
        registrySignalColors[s.id] = s.defaultColor;
      }

      // localStorage overrides (customizations) should win over registry defaults.
      const saved = loadSignalColors();
      applySignalColors({ ...registrySignalColors, ...saved });

      set({
        loaded: true,
        loading: false,
        error: null,
        signalsById,
        connectorsById,
        categories: registry.categories,
        connectorCompatKeys,
      });
    } catch (e) {
      set({
        loaded: false,
        loading: false,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  },
}));

export function getSignalLabel(type: SignalType): string {
  const state = useLibraryRegistryStore.getState();
  return state.signalsById[type]?.label ?? SIGNAL_LABELS[type] ?? type;
}

export function getConnectorLabel(type: ConnectorType): string {
  const state = useLibraryRegistryStore.getState();
  return state.connectorsById[type]?.label ?? CONNECTOR_LABELS[type] ?? type;
}

export function getSignalDefaultColor(type: SignalType): string | undefined {
  const state = useLibraryRegistryStore.getState();
  return state.signalsById[type]?.defaultColor ?? SIGNAL_COLORS[type];
}

export function getSignalCableLabel(type: SignalType): string | undefined {
  const state = useLibraryRegistryStore.getState();
  return state.signalsById[type]?.cableLabel;
}

export function getConnectorCableLabel(type: ConnectorType): string | undefined {
  const state = useLibraryRegistryStore.getState();
  return state.connectorsById[type]?.cableLabel;
}

export function getDefaultConnectorForSignal(signalType: SignalType): ConnectorType | undefined {
  const state = useLibraryRegistryStore.getState();
  return state.signalsById[signalType]?.defaultConnectorId ?? undefined;
}

export function getAllSignalTypes(): SignalType[] {
  const state = useLibraryRegistryStore.getState();
  const keys = Object.keys(state.signalsById);
  if (keys.length > 0) return keys;
  return Object.keys(SIGNAL_LABELS);
}

export function getAllConnectorTypes(): ConnectorType[] {
  const state = useLibraryRegistryStore.getState();
  const keys = Object.keys(state.connectorsById);
  if (keys.length > 0) return keys;
  return Object.keys(CONNECTOR_LABELS);
}

/**
 * Connection compatibility:
 * - Missing connector info = don't mismatch
 * - Exact match always compatible
 * - Else: consult runtime registry pairs, fallback to legacy hardcoded groups
 */
export function areConnectorsCompatibleDynamic(
  a: ConnectorType | undefined,
  b: ConnectorType | undefined,
): boolean {
  if (!a || !b) return true;
  if (a === b) return true;

  const state = useLibraryRegistryStore.getState();
  const key = compatKey(a, b);
  if (state.loaded && state.connectorCompatKeys.has(key)) return true;

  // Legacy fallback for built-ins (until your DB is seeded).
  for (const group of CONNECTOR_COMPAT_GROUPS) {
    if (group.includes(a) && group.includes(b)) return true;
  }
  return false;
}

export function isNetworkSignal(type: SignalType): boolean {
  const state = useLibraryRegistryStore.getState();
  return state.signalsById[type]?.isNetwork ?? NETWORK_SIGNAL_TYPES.has(type);
}

export function isVideoSignal(type: SignalType): boolean {
  const state = useLibraryRegistryStore.getState();
  return state.signalsById[type]?.isVideo ?? VIDEO_SIGNAL_TYPES.has(type);
}

