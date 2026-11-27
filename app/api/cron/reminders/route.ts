import { NextResponse } from 'next/server'

import { getPayloadClient } from '@/lib/game-queries'
import { sendAttendanceReminders, sendReminders } from '@/lib/reminders'

/**
 * "Oyununuz 2 saata başlayır", and after the game "Oyun bitdi: kimin gəldiyini qeyd edin" to the host. Needs a call every 15 minutes, which Vercel's free plan can't schedule
 * (its cron runs daily), so an outside scheduler such as cron-job.org calls it with
 * `Authorization: Bearer $CRON_SECRET`, like `/api/cron/cleanup`. Without the secret it refuses everyone.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return new NextResponse('Unauthorized', { status: 401 })
  }
  const payload = await getPayloadClient()
  const reminded = await sendReminders(payload)
  // Same run: hosts of games that ended get asked to mark who came.
  const attendanceReminded = await sendAttendanceReminders(payload)
  return NextResponse.json({ ok: true, reminded, attendanceReminded })
}
