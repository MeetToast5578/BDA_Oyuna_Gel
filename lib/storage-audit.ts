import { sql, type PostgresAdapter } from '@payloadcms/db-postgres'
import { cleanUpOldData, RETENTION } from '@/lib/cleanup'

/** Aggregates only, in one read-only snapshot. No identities, phone numbers or URLs. */
export async function storageAudit(db: PostgresAdapter['drizzle']) {
  return db.transaction(async (tx) => {
    const database = (await tx.execute<{ bytes: string }>(sql`SELECT pg_database_size(current_database()) AS bytes`)).rows[0]
    const tables = (await tx.execute<{ table: string; estimated_rows: string; table_bytes: string; index_bytes: string; total_bytes: string }>(sql`
      SELECT c.relname AS table, coalesce(s.n_live_tup, 0) AS estimated_rows,
        pg_table_size(c.oid) AS table_bytes, pg_indexes_size(c.oid) AS index_bytes,
        pg_total_relation_size(c.oid) AS total_bytes
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      LEFT JOIN pg_stat_user_tables s ON s.relid=c.oid
      WHERE n.nspname='public' AND c.relkind='r' ORDER BY pg_total_relation_size(c.oid) DESC`)).rows
    const games = (await tx.execute<Record<string, string>>(sql`SELECT count(*) AS total,
      count(*) FILTER (WHERE is_demo IS TRUE) AS demo,
      count(*) FILTER (WHERE scheduled_at < now() - interval '90 days') AS older_than_90_days,
      count(*) FILTER (WHERE scheduled_at < now() - interval '365 days') AS older_than_365_days,
      count(*) FILTER (WHERE home_score IS NOT NULL OR away_score IS NOT NULL) AS with_scores
      FROM games`)).rows[0]
    const media = (await tx.execute<Record<string, string>>(sql`SELECT count(*) AS records,
      count(*) FILTER (WHERE filesize IS NULL) AS missing_original_size,
      coalesce(sum(coalesce(filesize,0)::bigint + coalesce(sizes_thumbnail_filesize,0)::bigint + coalesce(sizes_full_filesize,0)::bigint),0) AS recorded_bytes
      FROM media`)).rows[0]
    const numbers = (row: Record<string, string>) => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, Number(value)]))
    return { observedAt: new Date().toISOString(), databaseBytes: Number(database.bytes),
      tables: tables.map((row) => ({ name: row.table, estimatedRows: Number(row.estimated_rows), tableBytes: Number(row.table_bytes), indexBytes: Number(row.index_bytes), totalBytes: Number(row.total_bytes) })),
      games: numbers(games), media: numbers(media), retentionDays: RETENTION,
      cleanupCandidates: await cleanUpOldData(tx, true),
    }
  }, { accessMode: 'read only', isolationLevel: 'repeatable read' })
}
