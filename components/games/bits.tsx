import Image from 'next/image'
import type { CSSProperties } from 'react'

import { Icon, isIconName } from '@/components/ui/Icon'
import type { Participant } from '@/lib/api-types'
import styles from './bits.module.css'

/** The sport's ball icon (a medal for a sport without one), in the current text colour. Decorative. */
export function SportIcon({ sport, size = 16, className }: { sport: string; size?: number; className?: string }) {
  return <Icon name={isIconName(sport) ? sport : 'medal'} size={size} className={className} />
}

export function SportBadge({ sport, label, solid = false }: { sport: string; label: string; solid?: boolean }) {
  return (
    <span data-sport={sport} className={`${styles.badge} ${solid ? styles.sportSolid : styles.sport}`}>
      <SportIcon sport={sport} size={14} className={styles.sportIcon} />
      {label}
    </span>
  )
}

const LEVEL_BARS: Record<string, number> = { beginner: 1, medium: 2, high: 3 }

/** Level as a neutral chip with 1–3 signal bars; the label carries the meaning, the bars are decorative. */
export function LevelBadge({ level, label }: { level: string; label: string }) {
  const filled = LEVEL_BARS[level] ?? 2
  return (
    <span className={`${styles.badge} ${styles.level}`}>
      <svg className={styles.levelBars} width="12" height="11" viewBox="0 0 12 11" aria-hidden="true" focusable="false">
        {[0, 1, 2].map((bar) => (
          <rect key={bar} x={bar * 4.5} y={7 - bar * 3.5} width="3" height={4 + bar * 3.5} rx="1" className={bar < filled ? styles.barOn : undefined} />
        ))}
      </svg>
      {label}
    </span>
  )
}

export function ProgressBar({
  value,
  max,
  label,
  className,
  style,
}: {
  value: number
  max: number
  label: string
  className?: string
  /** Overrides for --track / --fill colors and height. */
  style?: CSSProperties
}) {
  const percent = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0
  return (
    <div
      className={`${styles.track} ${className ?? ''}`}
      style={style}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
    >
      <div className={styles.fill} style={{ width: `${percent}%` }} />
    </div>
  )
}

// Initials backgrounds: the brand, the accent and the sport inks, each AA (4.5:1+) with its text.
const AVATAR_TONES = [
  { bg: '#3525cd', fg: '#fff' },
  { bg: '#15803d', fg: '#fff' },
  { bg: '#e8a33d', fg: '#5c3a0e' },
  { bg: '#c2410c', fg: '#fff' },
  { bg: '#5b3df0', fg: '#fff' },
]

/** All an avatar needs: players, hosts and the signed-in user all have these. */
type AvatarPerson = Pick<Participant, 'name' | 'initials' | 'avatarUrl'>

export function Avatar({
  person,
  size,
  toneIndex,
  decorative = false,
  className,
}: {
  person: AvatarPerson
  size: number
  /** Picks an initials background from the palette; omit for the brand color. */
  toneIndex?: number
  /** Set when the name is already shown next to the avatar, so it isn't announced twice. */
  decorative?: boolean
  className?: string
}) {
  const tone = toneIndex === undefined ? null : AVATAR_TONES[toneIndex % AVATAR_TONES.length]
  const style = {
    width: size,
    height: size,
    fontSize: Math.round(size * 0.32),
    ...(tone ? { '--avatar-bg': tone.bg, color: tone.fg } : {}),
  } as CSSProperties

  return (
    <span
      className={`${styles.avatar} ${className ?? ''}`}
      style={style}
      title={decorative ? undefined : person.name}
      aria-hidden={decorative || undefined}
    >
      {person.avatarUrl ? (
        <Image src={person.avatarUrl} alt={decorative ? '' : person.name} width={size} height={size} sizes={`${size}px`} />
      ) : (
        <>
          <span aria-hidden="true">{person.initials}</span>
          {!decorative && <span className="visually-hidden">{person.name}</span>}
        </>
      )}
    </span>
  )
}

/**
 * The first players' avatars and a "+N" for the rest. Only a picture: it is drawn inside the
 * players button (`PlayersButton`), which names it and opens the full list, so the avatars are not
 * separate targets and are hidden from screen readers. `--spread` (set by that button on hover) fans
 * them out a little.
 */
export function AvatarStack({
  people,
  total,
  size,
  overlap,
  ring = 2,
  moreStyle,
}: {
  people: Participant[]
  total: number
  size: number
  overlap: number
  ring?: number
  /** Colors of the "+N" bubble. */
  moreStyle?: { bg: string; color: string }
}) {
  const extra = Math.max(0, total - people.length)
  if (people.length === 0 && extra === 0) return null

  return (
    <span
      className={styles.stack}
      aria-hidden="true"
      style={{ '--overlap': `${overlap}px`, '--ring': `${ring}px` } as CSSProperties}
    >
      {people.map((person, index) => (
        <span key={`${person.id ?? person.name}-${index}`} className={styles.stackItem}>
          <Avatar person={person} size={size} toneIndex={index} decorative />
        </span>
      ))}
      {extra > 0 && (
        <span className={styles.stackItem}>
          <span
            className={`${styles.avatar} ${styles.more}`}
            style={
              {
                width: size,
                height: size,
                fontSize: Math.round(size * 0.31),
                fontWeight: 700,
                ...(moreStyle ? { '--more-bg': moreStyle.bg, '--more-color': moreStyle.color } : {}),
              } as CSSProperties
            }
          >
            +{extra}
          </span>
        </span>
      )}
    </span>
  )
}
