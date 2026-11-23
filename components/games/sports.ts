import type { AvailabilityStatus } from '@/lib/api-types'

/** Tab order in the design: Futbol, Tennis, Basketbol. */
export const SPORT_ORDER = ['football', 'tennis', 'basketball']

export function sortSports<T extends { sport: string }>(sports: T[]) {
  const rank = (sport: string) => {
    const index = SPORT_ORDER.indexOf(sport)
    return index === -1 ? SPORT_ORDER.length : index
  }
  return [...sports].sort((a, b) => rank(a.sport) - rank(b.sport))
}

export const SPORT_LABELS: Record<string, string> = {
  football: 'Futbol',
  tennis: 'Tennis',
  basketball: 'Basketbol',
}

export const LEVEL_OPTIONS = [
  { value: 'beginner', label: 'Başlanğıc' },
  { value: 'medium', label: 'Orta' },
  { value: 'high', label: 'Yüksək' },
] as const

/** Button label for games that can't be joined. */
export const STATUS_LABELS: Record<Exclude<AvailabilityStatus, 'open'>, string> = {
  full: 'Dolu',
  live: 'Oyun davam edir',
  finished: 'Oyun bitib',
  cancelled: 'Ləğv edilib',
}
