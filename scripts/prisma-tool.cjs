const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { Client } = require('pg');

const root = path.resolve(__dirname, '..');

async function deploy() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is required to deploy migrations.');
  const migrationsDir = path.join(root, 'prisma', 'migrations');
  const migrationNames = fs
    .readdirSync(migrationsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const client = new Client({ connectionString });
  await client.connect();
  try {
    await client.query("SELECT pg_advisory_lock(hashtext('qlsv_migrations'))");
    await client.query(`
      CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
        "id" VARCHAR(36) PRIMARY KEY,
        "checksum" VARCHAR(64) NOT NULL,
        "finished_at" TIMESTAMPTZ,
        "migration_name" VARCHAR(255) NOT NULL,
        "logs" TEXT,
        "rolled_back_at" TIMESTAMPTZ,
        "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "applied_steps_count" INTEGER NOT NULL DEFAULT 0
      )
    `);
    const applied = await client.query(
      'SELECT migration_name, checksum, finished_at FROM "_prisma_migrations" WHERE rolled_back_at IS NULL',
    );
    const appliedByName = new Map(applied.rows.map((row) => [row.migration_name, row]));
    const unknown = [...appliedByName.keys()].filter((name) => !migrationNames.includes(name));
    if (unknown.length > 0) {
      throw new Error(`Database contains migrations missing locally: ${unknown.join(', ')}`);
    }

    const newlyApplied = [];
    for (const migrationName of migrationNames) {
      const sql = fs.readFileSync(path.join(migrationsDir, migrationName, 'migration.sql'), 'utf8');
      const checksum = crypto.createHash('sha256').update(sql).digest('hex');
      const existing = appliedByName.get(migrationName);
      if (existing) {
        if (!existing.finished_at) throw new Error(`Migration ${migrationName} is unfinished.`);
        if (existing.checksum !== checksum)
          throw new Error(`Migration ${migrationName} checksum mismatch.`);
        continue;
      }

      await client.query('BEGIN');
      try {
        const id = crypto.randomUUID();
        await client.query(
          'INSERT INTO "_prisma_migrations" (id, checksum, migration_name) VALUES ($1, $2, $3)',
          [id, checksum, migrationName],
        );
        await client.query(sql);
        await client.query(
          'UPDATE "_prisma_migrations" SET finished_at = now(), applied_steps_count = 1 WHERE id = $1',
          [id],
        );
        await client.query('COMMIT');
        newlyApplied.push(migrationName);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }
    console.log(`Applied migrations: ${newlyApplied.join(', ') || 'none'}.`);
  } finally {
    await client
      .query("SELECT pg_advisory_unlock(hashtext('qlsv_migrations'))")
      .catch(() => undefined);
    await client.end();
  }
}

const commands = { deploy };
const command = process.argv[2];
if (!commands[command]) {
  console.error(`Usage: node scripts/prisma-tool.cjs <${Object.keys(commands).join('|')}>`);
  process.exit(2);
}

commands[command]().catch((error) => {
  console.error(error);
  process.exit(1);
});
