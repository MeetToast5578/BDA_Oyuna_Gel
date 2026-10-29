import Link from 'next/link'

import type { GameCard as GameCardData } from '@/lib/api-types'
import { isUpcoming, matchupLabel } from '@/lib/game-backend'
import { buttonClass } from '@/components/ui/button'
import { Icon } from '@/components/ui/Icon'
import { Avatar, LevelBadge, ProgressBar, SportBadge } from './bits'
import { CoverImage } from './CoverImage'
import { LeaveGame } from './LeaveGame'
import styles from './GameCard.module.css'
import { STATUS_LABELS } from './sports'

/**
 * Which list the card is in, which decides its action. `browse` is the public lists, where an open
 * game offers "Qoşul". On the profile the viewer is already in `joined` games and runs `hosting`
 * ones, so offering to join them would be wrong; `past` games have nothing left to do.
 */
export type GameCardContext = 'browse' | 'joined' | 'hosting' | 'past'

export function GameCard({
  game,
  priority = false,
  headingLevel = 'h3',
  context = 'browse',
  onLeft,
}: {
  game: GameCardData
  priority?: boolean
  /** One level below the heading of the list the card is in. */
  headingLevel?: 'h2' | 'h3'
  context?: GameCardContext
  /** In the `joined` list: the viewer left this game from its card ("Oyundan çıx"). */
  onLeft?: (gameId: string) => void
}) {
  const Heading = headingLevel
  const href = `/games/${game.id}`
  const location = [game.venue.name, game.venue.district].filter(Boolean).join(', ')
  const past = context === 'past'

  return (
    <article className={styles.card}>
      <div className={styles.media}>
        <CoverImage
          src={game.coverImage.thumbnailUrl}
          fallbackSrc={game.coverImage.fallbackUrl}
          alt=""
          sizes="(max-width: 599px) 104px, (max-width: 859px) 100vw, (max-width: 1023px) 50vw, 339px"
          priority={priority}
        />
        <div className={styles.badges}>
          <LevelBadge level={game.level} label={game.levelLabel} />
          <SportBadge sport={game.sport} label={game.sportLabel} />
        </div>
      </div>

      <div className={styles.body}>
        <div className={styles.meta}>
          <Heading className={styles.title}>
            <Link href={href} className={styles.titleLink}>
              {game.title}
            </Link>
          </Heading>
          {matchupLabel(game.teams) && (
            <p className={styles.metaRow}>
              <span className={styles.metaItem}>
                <span className="visually-hidden">Komandalar:</span>
                {matchupLabel(game.teams)}
              </span>
            </p>
          )}
          {location && (
            <p className={styles.metaRow}>
              <span className={styles.metaItem}>
                <Icon name="pin" />
                <span className="visually-hidden">Məkan:</span>
                {game.venue.id ? (
                  <Link href={`/venues/${game.venue.id}`} className={styles.venueLink}>
                    {location}
                  </Link>
                ) : (
                  location
                )}
              </span>
            </p>
          )}
        </div>

        <p className={`${styles.metaRow} ${styles.strong}`}>
          <span className={styles.metaItem}>
            <Icon name="calendar" />
            <span className="visually-hidden">Tarix:</span>
            {game.dateLabel}
          </span>
          <span className={styles.metaItem}>
            <Icon name="clock" />
            <span className="visually-hidden">Saat:</span>
            {game.timeLabel}
          </span>
        </p>

        <div className={styles.progress}>
          <p className={styles.progressLabels}>
            <span className={styles.count}>
              {game.currentCount}/{game.maxCount} oyunçu
            </span>
            {/* Free spots mean nothing once a game is over. */}
            {!past &&
              (game.remainingSpots > 0 ? (
                <span className={styles.remaining}>{game.remainingSpots} yer qalıb</span>
              ) : (
                <span className={styles.remainingNone}>Yer qalmayıb</span>
              ))}
          </p>
          <ProgressBar value={game.currentCount} max={game.maxCount} label="Doluluq" />
        </div>

        <div className={styles.footer}>
          <div className={styles.host}>
            <Avatar person={game.host} size={32} decorative />
            {game.host.id ? (
              // Above the card-wide title link, so it can be clicked on its own.
              <Link href={`/users/${game.host.id}`} className={`${styles.hostName} ${styles.hostLink}`}>
                <span className="visually-hidden">Host: </span>
                {game.host.name}
              </Link>
            ) : (
              <span className={styles.hostName}>
                <span className="visually-hidden">Host: </span>
                {game.host.name}
              </span>
            )}
          </div>
          <div className={styles.action}>
            <CardAction game={game} href={href} context={context} onLeft={onLeft} />
          </div>
        </div>
      </div>
    </article>
  )
}

function CardAction({
  game,
  href,
  context,
  onLeft,
}: {
  game: GameCardData
  href: string
  context: GameCardContext
  onLeft?: (gameId: string) => void
}) {
  if (context === 'past') {
    const label = game.status === 'cancelled' ? 'Ləğv edilib' : game.status === 'live' ? 'Davam edir' : 'Keçmiş oyun'
    return <span className={buttonClass('muted', 'sm')}>{label}</span>
  }

  // The edit page refuses a game that has started.
  if (context === 'hosting' && isUpcoming(game.status)) {
    return (
      <Link
        href={`${href}/edit`}
        className={buttonClass('outlinePrimary', 'sm', { className: styles.join })}
        aria-label={`${game.title} oyununu redaktə et`}
      >
        Redaktə et
      </Link>
    )
  }

  // A game the viewer is in can be left from its card until kick-off; the card itself opens the game.
  if (context === 'joined' && onLeft && isUpcoming(game.status)) {
    return <LeaveGame gameId={game.id} gameTitle={game.title} onLeft={() => onLeft(game.id)} size="card" />
  }

  if (context === 'joined' || context === 'hosting') {
    return game.status === 'cancelled' ? (
      <span className={buttonClass('muted', 'sm')}>{STATUS_LABELS.cancelled}</span>
    ) : (
      <Link
        href={href}
        className={buttonClass('outlinePrimary', 'sm', { className: styles.join })}
        aria-label={`${game.title} oyununa bax`}
      >
        Oyuna bax
      </Link>
    )
  }

  if (game.status === 'open') {
    // Not prefetched: the title link already prefetches this game, and for a signed-out visitor
    // ?join=1 is a redirect to /login (proxy.ts) that isn't worth fetching ahead.
    return (
      <Link
        href={`${href}?join=1`}
        prefetch={false}
        className={buttonClass('primary', 'sm', { className: styles.join })}
        aria-label={`${game.title} oyununa qoşul`}
      >
        Qoşul
      </Link>
    )
  }

  // A full game still takes names for its waitlist, on the game's page.
  if (game.status === 'full') {
    return (
      <Link
        href={href}
        className={buttonClass('outlinePrimary', 'sm', { className: styles.join })}
        aria-label={`${game.title}: gözləmə siyahısına yaz`}
      >
        Növbəyə yazıl
      </Link>
    )
  }

  return (
    <button type="button" className={buttonClass('muted', 'sm')} disabled>
      {STATUS_LABELS[game.status]}
    </button>
  )
}
