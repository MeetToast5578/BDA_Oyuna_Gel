import { SPORTS } from '@/lib/game-backend'

export type VenueSuggestion = { name: string; district: string | null; address: string | null; sports: string[]; note: string | null }

const text = (value: unknown, max: number) => (typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null)

/** The "Meydança təklif et" form: a name (2–80), at least one sport, and optional district, address and note. */
export function parseVenueSuggestion(body: unknown): VenueSuggestion | null {
  const data = (body ?? {}) as Record<string, unknown>
  const name = text(data.name, 80)
  const sports = Array.isArray(data.sports) ? [...new Set(data.sports.filter((sport): sport is string => typeof sport === 'string' && SPORTS.includes(sport)))] : []
  if (!name || name.length < 2 || sports.length === 0) return null
  return { name, district: text(data.district, 60), address: text(data.address, 160), sports, note: text(data.note, 500) }
}
