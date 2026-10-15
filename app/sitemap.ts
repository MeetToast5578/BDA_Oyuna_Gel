import type { MetadataRoute } from 'next'
import { connection } from 'next/server'

import { parseGameListParams } from '@/lib/game-backend'
import { findGames } from '@/lib/game-queries'
import { SITE_URL } from '@/lib/site-url'

const STATIC_PATHS = ['/', '/games', '/games/past', '/venues', '/about', '/rules', '/privacy', '/contact']
// shortcut: lists at most 20 pages of 50 upcoming games; page the sitemap (generateSitemaps) past 1,000.
const MAX_PAGES = 20

/** The public pages plus every upcoming game. Profiles carry noindex, so they are left out. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // The games list depends on the time, so it is read per request, not frozen at build.
  await connection()
  const now = new Date()
  const to = new Date(now.getTime() + 366 * 24 * 60 * 60 * 1000).toISOString()

  const games: MetadataRoute.Sitemap = []
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const parsed = parseGameListParams(new URLSearchParams({ to, limit: '50', page: String(page) }), now)
    if (!parsed.ok) break
    const { games: found, pagination } = await findGames(parsed.query, now)
    for (const game of found) games.push({ url: `${SITE_URL}/games/${game.id}`, changeFrequency: 'hourly' })
    if (!pagination.hasNextPage) break
  }

  return [...STATIC_PATHS.map((path) => ({ url: `${SITE_URL}${path === '/' ? '' : path}` })), ...games]
}
