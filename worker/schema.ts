// Database schema, applied by the Worker itself (see ensureSchema): no
// separate migration step in the deploy pipeline, and production and
// preview databases are handled the same way.
//
// To change the schema, append a migration; never edit an applied one.
export const MIGRATIONS: { version: number; sql: string[] }[] = [
  {
    version: 1,
    sql: [
      // A thread is a row with parent_id NULL, anchored to a quote on a page;
      // replies point at their thread through parent_id.
      `CREATE TABLE IF NOT EXISTS annotations (
        id TEXT PRIMARY KEY,
        page TEXT NOT NULL,
        parent_id TEXT,
        quote TEXT NOT NULL DEFAULT '',
        prefix TEXT NOT NULL DEFAULT '',
        suffix TEXT NOT NULL DEFAULT '',
        body TEXT NOT NULL,
        author TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        resolved_at INTEGER,
        resolved_by TEXT,
        deleted_at INTEGER
      )`,
      `CREATE INDEX IF NOT EXISTS idx_annotations_page ON annotations (page, deleted_at, created_at)`,
      `CREATE INDEX IF NOT EXISTS idx_annotations_parent ON annotations (parent_id)`,
    ],
  },
];

export const SCHEMA_VERSION = MIGRATIONS[MIGRATIONS.length - 1].version;

let applied: Promise<void> | null = null;

export function ensureSchema(db: D1Database): Promise<void> {
  applied ??= migrate(db).catch((e) => {
    applied = null; // retry on the next request
    throw e;
  });
  return applied;
}

async function migrate(db: D1Database) {
  await db.prepare('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL)').run();
  const row = await db.prepare('SELECT MAX(version) AS v FROM schema_migrations').first<{ v: number | null }>();
  const current = row?.v ?? 0;
  for (const m of MIGRATIONS) {
    if (m.version <= current) continue;
    // One batch = one transaction; a concurrent isolate applying the same
    // migration fails on the primary key and is ignored below.
    try {
      await db.batch([
        ...m.sql.map((s) => db.prepare(s)),
        db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').bind(m.version, Date.now()),
      ]);
    } catch (e) {
      const again = await db.prepare('SELECT 1 FROM schema_migrations WHERE version = ?').bind(m.version).first();
      if (!again) throw e;
    }
  }
}
