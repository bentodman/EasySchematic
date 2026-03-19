-- Categories as tree (GUIDs, parent_id); templates.category_id points to one category.
-- Migrates from: categories(id, label) + category_device_types(category_id, device_type)
-- to: categories(id GUID, parent_id GUID nullable, label, sort_order); templates.category_id.

-- 1) Mapping: old category id -> new GUID
CREATE TABLE _cat_migrate (
  old_id TEXT NOT NULL PRIMARY KEY,
  new_id TEXT NOT NULL
);

INSERT INTO _cat_migrate (old_id, new_id)
SELECT id,
  lower(
    hex(randomblob(4)) || '-' ||
    hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 1, 2) || '-' ||
    substr('89ab', abs(random()) % 4 + 1, 1) || hex(randomblob(2)) || '-' ||
    hex(randomblob(6))
  )
FROM categories;

-- 2) New categories table (tree)
CREATE TABLE categories_new (
  id TEXT PRIMARY KEY,
  parent_id TEXT REFERENCES categories_new(id),
  label TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO categories_new (id, parent_id, label, sort_order, created_at, updated_at)
SELECT m.new_id, NULL, c.label, 0, c.created_at, c.updated_at
FROM _cat_migrate m
JOIN categories c ON c.id = m.old_id;

-- 3) Add category_id to templates (logical FK to categories.id after rename)
ALTER TABLE templates ADD COLUMN category_id TEXT;

-- 4) Assign each template to first category that contained its device_type
UPDATE templates
SET category_id = (
  SELECT m.new_id
  FROM _cat_migrate m
  INNER JOIN category_device_types cdt ON cdt.category_id = m.old_id
  WHERE cdt.device_type = templates.device_type
  ORDER BY cdt.sort_order
  LIMIT 1
);

-- 5) Drop old category model
DROP TABLE category_device_types;
DROP TABLE categories;

-- 6) Replace with new table
ALTER TABLE categories_new RENAME TO categories;

-- 7) Cleanup
DROP TABLE _cat_migrate;

-- Index for tree lookups and template filtering
CREATE INDEX IF NOT EXISTS idx_categories_parent ON categories(parent_id);
CREATE INDEX IF NOT EXISTS idx_templates_category ON templates(category_id);
