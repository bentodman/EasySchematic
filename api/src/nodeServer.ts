import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { config as loadEnv } from "dotenv";

import app from "./index";

const __dirnameNode = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.resolve(__dirnameNode, "..", ".env") });
import { createSqliteD1Adapter } from "./sqliteD1Adapter";

const __dirname = __dirnameNode;
const apiDir = path.resolve(__dirname, "..");
const migrationsDir = path.join(apiDir, "migrations");

async function readRequestBody(req: http.IncomingMessage): Promise<Buffer | undefined> {
  const method = (req.method ?? "GET").toUpperCase();
  if (method === "GET" || method === "HEAD") return undefined;
  return await new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    req.on("end", () => resolve(chunks.length ? Buffer.concat(chunks) : undefined));
    req.on("error", reject);
  });
}

function toHeaders(req: http.IncomingMessage): Headers {
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value == null) continue;
    if (Array.isArray(value)) {
      // Merge multiple header values.
      headers.set(key, value.join(","));
    } else {
      headers.set(key, value);
    }
  }
  return headers;
}

function applySqliteMigrations(sqlite: Database) {
  // Lightweight "already applied" tracking; avoids rerunning ALTER TABLE migrations.
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

const PORT = Number(process.env.PORT ?? 8787);
const HOST = process.env.HOST ?? "0.0.0.0";
const SQLITE_PATH = process.env.SQLITE_PATH ?? path.join(process.cwd(), "easyschematic.db");
const ADMIN_TOKEN = process.env.ADMIN_TOKEN ?? "";
const RESEND_API_KEY = process.env.RESEND_API_KEY ?? "";

if (!ADMIN_TOKEN) {
  // Not fatal for read-only usage, but admin/template writes will fail.
  // eslint-disable-next-line no-console
  console.warn("[nodeServer] ADMIN_TOKEN is not set.");
}

// Apply migrations once on boot.
{
  const sqlite = new Database(SQLITE_PATH);
  applySqliteMigrations(sqlite);
  sqlite.close();
}

const env = {
  easyschematic_db: createSqliteD1Adapter(SQLITE_PATH),
  ADMIN_TOKEN,
  RESEND_API_KEY,
} as const;

const server = http.createServer(async (req, res) => {
  try {
    const host = req.headers.host ?? "localhost";
    const url = new URL(req.url ?? "/", `http://${host}`);
    const body = await readRequestBody(req);

    const request = new Request(url.toString(), {
      method: req.method ?? "GET",
      headers: toHeaders(req),
      body: body,
    });

    const response = await app.fetch(request, env);

    res.statusCode = response.status;
    response.headers.forEach((value, key) => {
      res.setHeader(key, value);
    });

    const buf = Buffer.from(await response.arrayBuffer());
    res.end(buf);
  } catch (e) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end(e instanceof Error ? e.stack ?? e.message : "Internal Server Error");
  }
});

server.listen(PORT, HOST, () => {
  // eslint-disable-next-line no-console
  console.log(`[nodeServer] listening on http://${HOST}:${PORT}`);
  // eslint-disable-next-line no-console
  console.log(`[nodeServer] sqlite db: ${SQLITE_PATH}`);
});

