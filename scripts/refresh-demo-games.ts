import { getPayload } from 'payload'
import config from '../payload.config'
import { refreshDemoGames } from '../lib/demo-games'

const args = process.argv.slice(2)
if (args.some((arg) => !['--apply', '--allow-remote'].includes(arg))) throw new Error('Usage: npm run demo:refresh -- [--apply] [--allow-remote]')
const apply = args.includes('--apply')
const host = new URL(process.env.DATABASE_URL ?? '').hostname
if (apply && !['localhost', '127.0.0.1', '::1', '[::1]'].includes(host) && !args.includes('--allow-remote')) {
  throw new Error('Remote writes require --allow-remote. Inspect the dry-run and confirm the database first.')
}
const payload = await getPayload({ config })
try { console.log(JSON.stringify(await refreshDemoGames(payload, { apply }))) }
finally { await payload.db.destroy?.() }
