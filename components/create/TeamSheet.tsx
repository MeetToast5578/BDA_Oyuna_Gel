import { Avatar } from '@/components/games/bits'
import type { FoundPlayer } from '@/components/games/PlayerPicker'
import { occupancy, otherSide, sideCapacity, type Side } from '@/lib/team-logic'
import styles from './TeamSheet.module.css'

/** A football team has 11 slots; showing every empty one would bury the people. */
const EMPTY_SHOWN = 2

type Person = { name: string; initials: string; avatarUrl: string | null }

/**
 * The lineup the host is building: each team with its slots, filled by the host, the people who come
 * with them (no account), and the players they picked, each with "move to the other team" and "remove".
 * An invite holds no spot, so picked players are tagged "dəvət"; the count is who would be there if they
 * all came, and a team over its size says so.
 */
export function TeamSheet({
  labels,
  maxCount,
  host,
  hostSide,
  guests,
  invitees,
  onMove,
  onRemove,
}: {
  labels: Record<Side, string>
  maxCount: number
  host: Person
  hostSide: Side
  /** People who come with the host but have no account (the form's "Mövcud iştirakçı sayı" minus the host). */
  guests: number
  invitees: { player: FoundPlayer; side: Side }[]
  onMove: (playerId: string) => void
  onRemove: (playerId: string) => void
}) {
  const cap = sideCapacity(maxCount)
  // The guests stand with the host until that team is full, then spill over (the same rule the server uses).
  const counts = occupancy(maxCount, [hostSide], guests, hostSide)
  const guestsOn = (side: Side) => counts[side] - (side === hostSide ? 1 : 0)

  return (
    <div className={styles.sheet}>
      {(['home', 'away'] as const).map((side) => {
        const picked = invitees.filter((item) => item.side === side)
        const filled = (side === hostSide ? 1 : 0) + guestsOn(side) + picked.length
        const free = Math.max(cap - filled, 0)
        return (
          <section key={side} className={styles.side} aria-label={labels[side]}>
            <h3 className={styles.title}>
              <span>{labels[side]}</span>
              <span aria-label={`${filled} nəfər, yer sayı ${cap}`}>
                {filled}/{cap}
              </span>
            </h3>
            <ul className={styles.slots}>
              {side === hostSide && (
                <li className={styles.slot}>
                  <Avatar person={host} size={28} decorative />
                  <span className={styles.name}>{host.name}</span>
                  <span className={styles.tag}>Siz</span>
                </li>
              )}
              {Array.from({ length: guestsOn(side) }, (_, index) => (
                <li key={`guest-${index}`} className={styles.slot}>
                  <span className={styles.name}>Hesabsız oyunçu</span>
                  <span className={styles.tag}>hostla</span>
                </li>
              ))}
              {picked.map(({ player }) => (
                <li key={player.id} className={styles.slot}>
                  <Avatar person={player} size={28} decorative />
                  <span className={styles.name}>{player.name}</span>
                  <span className={styles.tag}>dəvət</span>
                  <button
                    type="button"
                    className={styles.iconButton}
                    onClick={() => onMove(player.id)}
                    aria-label={`${player.name} oyunçusunu ${labels[otherSide(side)]} komandasına köçür`}
                    title={`${labels[otherSide(side)]} komandasına köçür`}
                  >
                    <span aria-hidden="true">⇄</span>
                  </button>
                  <button
                    type="button"
                    className={`${styles.iconButton} ${styles.remove}`}
                    onClick={() => onRemove(player.id)}
                    aria-label={`${player.name} oyunçusunu siyahıdan sil`}
                    title="Sil"
                  >
                    <span aria-hidden="true">✕</span>
                  </button>
                </li>
              ))}
              {Array.from({ length: Math.min(free, EMPTY_SHOWN) }, (_, index) => (
                <li key={`free-${index}`} className={`${styles.slot} ${styles.empty}`}>
                  boş
                </li>
              ))}
              {free > EMPTY_SHOWN && (
                <li className={`${styles.slot} ${styles.empty}`}>… və daha {free - EMPTY_SHOWN} boş yer</li>
              )}
            </ul>
            {filled > cap && (
              <p className={styles.warning} role="status">
                Bu komandada {filled} nəfər var, yer sayı isə {cap}: hamı qoşula bilməyəcək.
              </p>
            )}
          </section>
        )
      })}
    </div>
  )
}
