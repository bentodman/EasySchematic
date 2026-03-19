import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

import { DEFAULT_SIGNAL_COLORS } from "../../src/signalColors";
import { CONNECTOR_COMPAT_GROUPS, DEFAULT_CONNECTOR, CONNECTOR_TO_CABLE, NETWORK_SIGNAL_TYPES, VIDEO_SIGNAL_TYPES } from "../../src/connectorTypes";
import { SIGNAL_TO_CABLE } from "../../src/cableTypes";
import { CONNECTOR_LABELS, SIGNAL_LABELS } from "../../src/types";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiDir = path.resolve(__dirname, "..");
const migrationsDir = path.join(apiDir, "migrations");

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function applySqliteMigrations(sqlite: Database) {
  sqlite.exec(`CREATE TABLE IF NOT EXISTS migrations_applied (id TEXT PRIMARY KEY)`);

  const migrationFiles = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const applied = new Set<string>(
    sqlite
      .prepare("SELECT id FROM migrations_applied")
      .all()
      .map((r: { id: string }) => r.id),
  );

  const insertApplied = sqlite.prepare("INSERT INTO migrations_applied (id) VALUES (?)");

  const tx = sqlite.transaction(() => {
    for (const file of migrationFiles) {
      if (applied.has(file)) continue;
      const sql = fs.readFileSync(path.join(migrationsDir, file), "utf-8");
      sqlite.exec(sql);
      insertApplied.run(file);
    }
  });

  tx();
}

const DEVICE_CATEGORIES_PATH = path.resolve(__dirname, "../../src/deviceCategories.json");
const DEVICE_CATEGORIES: Array<{ label: string; types: string[] }> = JSON.parse(
  fs.readFileSync(DEVICE_CATEGORIES_PATH, "utf-8"),
);

const SQLITE_PATH = process.env.SQLITE_PATH ?? path.join(process.cwd(), "easyschematic.db");
const RESET = process.argv.includes("--reset");

/**
 * Seeds the library tables using the project's existing built-in definitions.
 *
 * This script does not require an input JSON file; it bootstraps DB state from:
 * - `src/types.ts` (labels)
 * - `src/signalColors.ts` (default hex colors)
 * - `src/connectorTypes.ts` (connector labels, cable labels, compatibility groups, network/video flags)
 * - `src/cableTypes.ts` (signal->cable label)
 * - `src/deviceCategories.json` (category labels + deviceType membership)
 *
 * If you later want to seed custom types programmatically, these are the API JSON shapes
 * the admin UI uses (see `api/src/index.ts`):
 * - Signal: { id, label, defaultColor, cableLabel, defaultConnectorId, isNetwork, isVideo }
 * - Connector: { id, label, cableLabel }
 * - Category: { id, label, deviceTypes }
 */

const sqlite = new Database(SQLITE_PATH);
applySqliteMigrations(sqlite);

if (RESET) {
  sqlite.exec("DELETE FROM connector_compatibility;");
  sqlite.exec("DELETE FROM category_device_types;");
  sqlite.exec("DELETE FROM categories;");
  sqlite.exec("DELETE FROM signals;");
  sqlite.exec("DELETE FROM connectors;");
}

const upsertConnector = sqlite.prepare(
  `INSERT OR REPLACE INTO connectors (id, label, cable_label, updated_at)
   VALUES (?, ?, ?, CURRENT_TIMESTAMP)`,
);
const upsertSignal = sqlite.prepare(
  `INSERT OR REPLACE INTO signals
   (id, label, default_color, cable_label, default_connector_id, is_network, is_video, updated_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
);
const upsertCategory = sqlite.prepare(
  `INSERT OR REPLACE INTO categories (id, label, updated_at)
   VALUES (?, ?, CURRENT_TIMESTAMP)`,
);
const upsertCategoryDeviceType = sqlite.prepare(
  `INSERT INTO category_device_types (category_id, device_type, sort_order) VALUES (?, ?, ?)`,
);

// Connectors
{
  const connectorIds = Object.keys(CONNECTOR_LABELS);
  const tx = sqlite.transaction(() => {
    for (const id of connectorIds) {
      const label = CONNECTOR_LABELS[id];
      const cableLabel = CONNECTOR_TO_CABLE[id as keyof typeof CONNECTOR_TO_CABLE] ?? id;
      upsertConnector.run(id, label, cableLabel);
    }
  });
  tx();
}

// Signals
{
  const signalIds = Object.keys(SIGNAL_LABELS);
  const tx = sqlite.transaction(() => {
    for (const id of signalIds) {
      const label = SIGNAL_LABELS[id];
      const defaultColor = DEFAULT_SIGNAL_COLORS[id as keyof typeof DEFAULT_SIGNAL_COLORS] ?? DEFAULT_SIGNAL_COLORS.custom;
      const cableLabel = SIGNAL_TO_CABLE[id as keyof typeof SIGNAL_TO_CABLE] ?? id;
      const defaultConnectorId = DEFAULT_CONNECTOR[id as keyof typeof DEFAULT_CONNECTOR] ?? null;
      const is_network = NETWORK_SIGNAL_TYPES.has(id as any) ? 1 : 0;
      const is_video = VIDEO_SIGNAL_TYPES.has(id as any) ? 1 : 0;
      upsertSignal.run(id, label, defaultColor, cableLabel, defaultConnectorId, is_network, is_video);
    }
  });
  tx();
}

// Connector compatibility: seed defaults from hardcoded groups.
// If you're using this importer as a one-time bootstrap, it’s OK to overwrite compatibility rows.
{
  sqlite.exec("DELETE FROM connector_compatibility;");

  const tx = sqlite.transaction(() => {
    for (const group of CONNECTOR_COMPAT_GROUPS) {
      for (let i = 0; i < group.length; i++) {
        for (let j = i + 1; j < group.length; j++) {
          const a = group[i];
          const b = group[j];
          const connectorA = a <= b ? a : b;
          const connectorB = a <= b ? b : a;
          // Ensure canonical pair ordering.
          // (The DB PK already enforces uniqueness.)
          sqlite
            .prepare("INSERT OR REPLACE INTO connector_compatibility (connector_a, connector_b) VALUES (?, ?)")
            .run(connectorA, connectorB);
        }
      }
    }
  });
  tx();
}

// Categories + join table
{
  sqlite.exec("DELETE FROM category_device_types;");
  sqlite.exec("DELETE FROM categories;");

  const tx = sqlite.transaction(() => {
    for (const cat of DEVICE_CATEGORIES) {
      const id = slugify(cat.label);
      upsertCategory.run(id, cat.label);
      for (let i = 0; i < cat.types.length; i++) {
        upsertCategoryDeviceType.run(id, cat.types[i], i);
      }
    }
  });
  tx();
}

sqlite.close();

// eslint-disable-next-line no-console
console.log(`[import-library] Seeded signals/connectors/categories into ${SQLITE_PATH}`);

