import type { PostgresAdapter } from '@payloadcms/db-postgres'
import { NextResponse } from 'next/server'

import { cleanUpOldData } from '@/lib/cleanup'
import { getPayloadClient } from '@/lib/game-queries'

/**
 * The daily cleanup, called by Vercel Cron (vercel.json). Vercel sends `Authorization: Bearer
 * $CRON_SECRET` when that variable is set in the project; without it the route refuses every call,
 * so nobody else can trigger it.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return new NextResponse('Unauthorized', { status: 401 })
  }
  const payload = await getPayloadClient()
  const removed = await cleanUpOldData((payload.db as unknown as PostgresAdapter).drizzle)
  console.log('cleanup', removed)
  return NextResponse.json({ ok: true, removed })
}
