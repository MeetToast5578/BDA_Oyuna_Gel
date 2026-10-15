import 'server-only'

import type { SportTab } from '@/lib/api-types'
import {
  DATE_PRESETS,
  DEFAULT_CITY,
  LEVEL_LABELS,
  SPORTS,
  parseGameListParams,
  type DatePreset,
  type ProfileWindow,
} from '@/lib/game-backend'
import { findGames, getOpenGamesCountBySport, getPastGamesCountBySport } from '@/lib/game-queries'

type SearchParams = Record<string, string | string[] | undefined>

/** The `?sport=` filter if it names a known sport; anything else means "all sports". */
export function sportFromSearchParams(params: SearchParams) {
  const sport = params.sport
  return typeof sport === 'string' && SPORTS.includes(sport) ? sport : null
}

/** `/games`' other filters. Values that aren't valid are dropped, as an unknown `?sport=` is. */
export type ListFilters = { date: DatePreset | null; level: string | null; venue: string | null }

export function listFiltersFromSearchParams(params: SearchParams): ListFilters {
  const { date, level, venue } = params
  return {
    date: typeof date === 'string' && DATE_PRESETS.includes(date as DatePreset) ? (date as DatePreset) : null,
    level: typeof level === 'string' && level in LEVEL_LABELS ? level : null,
    venue: typeof venue === 'string' && /^[1-9]\d{0,9}$/.test(venue) ? venue : null,
  }
}

/**
 * First page of a game list plus the sport tab counters, read straight from the same query
 * functions as `GET /api/v1/games` and `GET /api/v1/sports`. `when: 'past'` is "Keçmiş oyunlar":
 * games that already happened, with the tabs counting those instead of open ones.
 */
export async function loadGameList({
  sport,
  limit,
  to,
  when = 'upcoming',
  filters,
}: {
  sport: string | null
  limit: number
  to?: string
  when?: ProfileWindow
  filters?: ListFilters
}): Promise<{ list: Awaited<ReturnType<typeof findGames>>; sports: SportTab[] }> {
  const now = new Date()
  const params = new URLSearchParams({ limit: String(limit), when })
  if (sport) params.set('sport', sport)
  if (to) params.set('to', to)
  for (const [key, value] of Object.entries(filters ?? {})) if (value) params.set(key, value)

  const parsed = parseGameListParams(params, now)
  if (!parsed.ok) throw new Error(`Invalid game list query: ${parsed.message}`)

  const counts =
    when === 'past'
      ? getPastGamesCountBySport(DEFAULT_CITY, now)
      : getOpenGamesCountBySport(DEFAULT_CITY).then((sports) =>
          sports.map(({ openGamesCount, ...tab }) => ({ ...tab, count: openGamesCount })),
        )
  const [list, sports] = await Promise.all([findGames(parsed.query, now), counts])
  return { list, sports }
}
