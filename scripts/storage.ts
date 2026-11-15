import { readdir, lstat } from 'node:fs/promises'
import path from 'node:path'
import { getPayload } from 'payload'
import type { PostgresAdapter } from '@payloadcms/db-postgres'
import config from '../payload.config'
import { storageAudit } from '../lib/storage-audit'
import { cleanUpOldData } from '../lib/cleanup'

const [mode, ...args] = process.argv.slice(2)
if (!['audit', 'cleanup'].includes(mode) || args.some((arg) => !['--apply', '--allow-remote'].includes(arg))) throw new Error('Unknown storage command option.')
const cleanup = mode === 'cleanup'
const apply = args.includes('--apply')
if (apply && !cleanup) throw new Error('Storage audits are always read-only; use storage:cleanup to apply existing retention rules.')
if (apply && !['localhost', '127.0.0.1', '::1', '[::1]'].includes(new URL(process.env.DATABASE_URL ?? '').hostname) && !args.includes('--allow-remote')) {
  throw new Error('Remote cleanup requires --apply --allow-remote. Preview and confirm the target first.')
}

async function localUploads(root: string) {
  const totals = { files: 0, bytes: 0, skippedSymlinks: 0, unreadableEntries: 0, available: true }
  async function scan(directory: string) {
    const entries = await readdir(directory, { withFileTypes: true })
    for (const entry of entries) {
      try {
        const file = path.join(directory, entry.name)
        const stat = await lstat(file)
        if (stat.isSymbolicLink()) totals.skippedSymlinks++
        else if (stat.isDirectory()) await scan(file)
        else if (stat.isFile()) { totals.files++; totals.bytes += stat.size }
      } catch { totals.unreadableEntries++ }
    }
  }
  try {
    if ((await lstat(root)).isSymbolicLink()) { totals.skippedSymlinks++; totals.available = false }
    else await scan(root)
  } catch { totals.available = false }
  return totals
}

const payload = await getPayload({ config })
try {
  const db = (payload.db as unknown as PostgresAdapter).drizzle
  if (cleanup) {
    const counts = await db.transaction((tx) => cleanUpOldData(tx, !apply), { accessMode: apply ? 'read write' : 'read only' })
    console.log(JSON.stringify({ observedAt: new Date().toISOString(), applied: apply, ...(apply ? { removed: counts } : { candidates: counts }) }))
  } else {
    console.log(JSON.stringify({ ...await storageAudit(db), localUploads: await localUploads(path.resolve('media')),
      configuration: { cronSecretPresent: Boolean(process.env.CRON_SECRET), blobBindingPresent: Boolean(process.env.BLOB_READ_WRITE_TOKEN) },
    }))
  }
} finally { await payload.db.destroy?.() }
