import 'dotenv/config'
import { afterAll, beforeEach } from 'vitest'

// Tests create games, clubs and joins far faster than a person would. Each test starts with fresh
// rate-limit budgets (files run one at a time, see vitest.config.ts, so nothing else is counting).
// `pg` is the driver @payloadcms/db-postgres already brings.
if (process.env.DATABASE_URL) {
  const { default: pg } = await import('pg')
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL })
  await client.connect()
  beforeEach(async () => {
    await client.query('DELETE FROM rate_limits')
  })
  afterAll(async () => {
    await client.end()
  })
}
