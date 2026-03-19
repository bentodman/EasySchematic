-- Runtime-configurable device library definitions (signals, connectors, categories)

-- Signals are logical AV signal types (e.g. SDI, HDMI, NDI).
-- Connectors are physical connector types (e.g. BNC, HDMI, RJ45).
-- Categories group device templates in the UI.

CREATE TABLE IF NOT EXISTS connectors (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  cable_label TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS connector_compatibility (
  connector_a TEXT NOT NULL,
  connector_b TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY(connector_a, connector_b),
  FOREIGN KEY(connector_a) REFERENCES connectors(id),
  FOREIGN KEY(connector_b) REFERENCES connectors(id)
);

-- Store connector compatibility in canonical order.
-- Admin/API should write pairs such that connector_a <= connector_b (or vice versa)
-- to avoid duplicates. Compatibility is symmetric in code.
CREATE INDEX IF NOT EXISTS idx_connector_compatibility_a ON connector_compatibility(connector_a);

CREATE TABLE IF NOT EXISTS signals (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  default_color TEXT NOT NULL,
  cable_label TEXT NOT NULL,
  default_connector_id TEXT,
  is_network INTEGER NOT NULL DEFAULT 0,
  is_video INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(default_connector_id) REFERENCES connectors(id)
);

CREATE INDEX IF NOT EXISTS idx_signals_is_network ON signals(is_network);
CREATE INDEX IF NOT EXISTS idx_signals_is_video ON signals(is_video);

CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS category_device_types (
  category_id TEXT NOT NULL REFERENCES categories(id),
  device_type TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(category_id, device_type)
);

CREATE INDEX IF NOT EXISTS idx_category_device_types_type ON category_device_types(device_type);

