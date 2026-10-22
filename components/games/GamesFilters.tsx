import Link from 'next/link'

import { withQuery } from '@/lib/api-client'
import { LEVEL_LABELS, type DatePreset } from '@/lib/game-backend'
import type { ListFilters } from '@/lib/page-data'
import { buttonClass } from '@/components/ui/button'
import form from '@/components/ui/form.module.css'
import { SegmentedLinks } from '@/components/ui/SegmentedLinks'
import styles from './GamesSection.module.css'

export const DATE_LABELS: Record<DatePreset, string> = { today: 'Bu gün', tomorrow: 'Sabah', weekend: 'Həftəsonu' }

/**
 * "Tarix", "Səviyyə" and "Meydança" under the sport tabs on `/games` (and the last two on `/games/past`). Every filter lives in the URL,
 * like `?sport=`, so a filtered list can be shared and the back button undoes a change. The selects
 * are a plain GET form, which works before (and without) any JavaScript.
 */
export function GamesFilters({
  basePath,
  sport,
  filters,
  venues,
  dates = true,
}: {
  basePath: string
  sport: string | null
  filters: ListFilters
  venues: Array<{ id: string | null; name: string }>
  /** The date links; off for past games, since they only look ahead. */
  dates?: boolean
}) {
  const href = (date: DatePreset | null) => withQuery(basePath, { sport, ...filters, date })
  const active = Boolean(filters.date || filters.level || filters.venue)

  return (
    <div className={styles.filters}>
      {dates && (
        <SegmentedLinks
          label="Tarix"
          options={[
            { href: href(null), label: 'Hamısı', active: !filters.date },
            ...(Object.keys(DATE_LABELS) as DatePreset[]).map((date) => ({
              href: href(date),
              label: DATE_LABELS[date],
              active: filters.date === date,
            })),
          ]}
        />
      )}
      {/* Keyed on the filters: the selects are uncontrolled, and without a remount "Filtrləri sıfırla"
          (a client navigation) would leave them showing the old choice, which the next "Göstər" re-applies. */}
      <form key={`${filters.level ?? ''}|${filters.venue ?? ''}|${filters.date ?? ''}`} action={basePath} method="get" className={styles.filterForm}>
        {sport && <input type="hidden" name="sport" value={sport} />}
        {filters.date && <input type="hidden" name="date" value={filters.date} />}
        <label className={form.field}>
          <span className={form.labelSmall}>Səviyyə</span>
          <select name="level" defaultValue={filters.level ?? ''} className={`${form.input} ${form.inputCompact}`}>
            <option value="">Hamısı</option>
            {Object.entries(LEVEL_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className={form.field}>
          <span className={form.labelSmall}>Meydança</span>
          <select name="venue" defaultValue={filters.venue ?? ''} className={`${form.input} ${form.inputCompact}`}>
            <option value="">Hamısı</option>
            {venues.map((venue) =>
              venue.id ? (
                <option key={venue.id} value={venue.id}>
                  {venue.name}
                </option>
              ) : null,
            )}
          </select>
        </label>
        <button type="submit" className={buttonClass('primary', 'md')}>
          Göstər
        </button>
        {active && (
          <Link href={withQuery(basePath, { sport })} className={buttonClass('outlineDark', 'md')}>
            Filtrləri sıfırla
          </Link>
        )}
      </form>
    </div>
  )
}
