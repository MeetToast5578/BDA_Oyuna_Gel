import type { PostgresAdapter } from '@payloadcms/db-postgres'
import { NextResponse } from 'next/server'

import { cleanUpOldData } from '@/lib/cleanup'
import { getPayloadClient } from '@/lib/game-queries'
import { invalidateGamesCache } from '@/lib/cache-tags'

/**
 * The daily cleanup, called by Vercel Cron (vercel.json). Vercel sends `Authorization: Bearer
 * $CRON_SECRET` when that variable is set in the project; without it the route refuses every call,
 * so nobody else can trigger it.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return new NextResponse('Unauthorized', { status: 401, headers: { 'Cache-Control': 'no-store' } })
  }
  const params = new URL(request.url).searchParams
  if ([...params.keys()].some((key) => key !== 'dryRun') || params.getAll('dryRun').length > 1 || (params.has('dryRun') && !['0', '1'].includes(params.get('dryRun')!))) {
    return NextResponse.json({ ok: false, error: 'Use dryRun=1 for a preview or dryRun=0 to apply.' }, { status: 400, headers: { 'Cache-Control': 'no-store' } })
  }
  const dryRun = params.get('dryRun') === '1'
  const started = Date.now()
  try {
    const payload = await getPayloadClient()
    const db = (payload.db as unknown as PostgresAdapter).drizzle
    const counts = await db.transaction((tx) => cleanUpOldData(tx, dryRun), { accessMode: dryRun ? 'read only' : 'read write' })
    if (!dryRun && (counts.hostPhones || counts.participantPhones || counts.groupLinks)) invalidateGamesCache()
    console.log('cleanup', { dryRun, completedAt: new Date().toISOString(), durationMs: Date.now() - started, counts })
    return NextResponse.json({ ok: true, ...(dryRun ? { dryRun: true, candidates: counts } : { removed: counts }) }, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    console.error('cleanup', { ok: false, dryRun, completedAt: new Date().toISOString(), durationMs: Date.now() - started })
    return NextResponse.json({ ok: false, error: 'Cleanup failed; transaction rolled back.' }, { status: 500, headers: { 'Cache-Control': 'no-store' } })
  }
}
