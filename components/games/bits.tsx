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

export function LevelBadge({ level, label }: { level: string; label: string }) {
  const tone = styles[level as 'beginner' | 'medium' | 'high'] ?? styles.medium
  return <span className={`${styles.badge} ${styles.level} ${tone}`}>{label}</span>
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

// Initials backgrounds from the "İştirakçılar" avatar row.
const AVATAR_TONES = [
  { bg: '#2d6a4f', fg: '#fff' },
  { bg: '#e8a33d', fg: '#5c3a0e' },
  { bg: '#8e5b3c', fg: '#fff' },
  { bg: '#3d6b8a', fg: '#fff' },
  { bg: '#b4443c', fg: '#fff' },
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
