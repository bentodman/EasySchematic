import Database from "better-sqlite3";

/**
 * Minimal SQLite adapter that mimics Cloudflare D1's chaining API:
 *   db.prepare(sql).bind(...params).first()/all()/run()
 */
export function createSqliteD1Adapter(sqlitePath: string): any {
  const sqlite = new Database(sqlitePath);

  // Mirror D1Database shape only for what this API uses.
  const adapter = {
    prepare(sql: string) {
      const stmt = sqlite.prepare(sql);

      const execWithParams = (params: unknown[]) => ({
        first: async <T>() => stmt.get(...params) as T | undefined,
        all: async <T>() => ({ results: stmt.all(...params) as T[] }),
        run: async () => {
          stmt.run(...params);
        },
      });

      return {
        // Allow `.prepare(sql).first()/all()/run()` with no parameters.
        first: async <T>() => stmt.get() as T | undefined,
        all: async <T>() => ({ results: stmt.all() as T[] }),
        run: async () => {
          stmt.run();
        },

        // Allow `.prepare(sql).bind(...params).first()/all()/run()`
        bind: (...params: unknown[]) => execWithParams(params),
      };
    },
  };

  return adapter as any;
}

