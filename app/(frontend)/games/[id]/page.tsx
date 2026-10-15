import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { cache, Suspense } from 'react'

import { Avatar, LevelBadge, ProgressBar, SportBadge } from '@/components/games/bits'
import { BackLink } from '@/components/games/BackLink'
import { CoverImage } from '@/components/games/CoverImage'
import styles from '@/components/games/GameDetail.module.css'
import { JoinPanel } from '@/components/games/JoinPanel'
import { PlayersButton } from '@/components/games/PlayersButton'
import { ShareButton } from '@/components/games/ShareButton'
import { GameDetailSkeleton } from '@/components/games/skeletons'
import { buttonClass } from '@/components/ui/button'
import { Icon } from '@/components/ui/Icon'
import { googleCalendarUrl } from '@/lib/calendar'
import { isUpcoming, shareText } from '@/lib/game-backend'
import { getGameDetail } from '@/lib/game-queries'
import { formatPhone } from '@/lib/phone'
import { loginHref } from '@/lib/safe-redirect'
import { getCurrentUser } from '@/lib/session'
import { SITE_URL } from '@/lib/site-url'

type Props = {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

/** Shared by generateMetadata and the page within one request. */
const loadGame = cache(async (rawId: string) => {
  const gameId = Number(rawId)
  if (!Number.isSafeInteger(gameId) || gameId <= 0) return null
  // The session lookup and the game reads run side by side; only the "joined?" check waits for the user.
  const userPromise = getCurrentUser()
  const [game, user] = await Promise.all([
    getGameDetail(
      gameId,
      userPromise.then((user) => user?.id ?? null),
    ),
    userPromise,
  ])
  return game ? { game, user } : null
})

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const loaded = await loadGame((await params).id)
  if (!loaded) return { title: 'Oyun tapılmadı' }
  const { game } = loaded
  const description = `${game.sportLabel} · ${game.venue.label} · ${game.dateLabel}, ${game.timeLabel} · ${game.currentCount}/${game.maxCount} oyunçu`
  // The image comes from opengraph-image.tsx next to this page.
  return { title: game.title, description, openGraph: { title: game.title, description, type: 'website' } }
}

/**
 * The page chrome is static, so a click on a game shows it at once with a placeholder. Everything
 * below it hangs off who is asking (the join panel, the host controls, the host's phone) and streams.
 */
export default function GameDetailPage({ params, searchParams }: Props) {
  return (
    <div className={`container-wide ${styles.page}`}>
      <BackLink fallback="/" className={styles.back}>
        Geri qayıt
      </BackLink>
      <p className={styles.pageTitle}>Oyun Detalı</p>

      <Suspense fallback={<GameDetailSkeleton />}>
        <GameDetailContent params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  )
}

async function GameDetailContent({ params, searchParams }: Props) {
  const { id } = await params
  const loaded = await loadGame(id)
  if (!loaded) notFound()
  const { game, user } = loaded

  const canJoin = game.status === 'open' && !game.viewer.joined && !game.viewer.isHost
  const wantsToJoin = (await searchParams).join === '1'
  // "Qoşul" on a card while signed out: sign in first, then come back with the join modal open.
  // proxy.ts already sends visitors without a session cookie; this catches an expired one.
  if (wantsToJoin && canJoin && !user) redirect(loginHref(`/games/${game.id}?join=1`))

  const location = [game.venue.name, game.venue.district].filter(Boolean).join(', ')
  const { participants, host } = game
  // Once it has started, the page describes a game that happened rather than one to join.
  const upcoming = isUpcoming(game.status)
  const gameUrl = `${SITE_URL}/games/${game.id}`
  const googleCalendar = googleCalendarUrl(game, gameUrl)

  return (
    <div className={`${styles.layout} fade`}>
      <div className={styles.column}>
        <section className={styles.card} aria-labelledby="game-title">
          <div className={styles.cover}>
            <CoverImage
              src={game.coverImage.fullUrl}
              fallbackSrc={game.coverImage.fallbackUrl}
              alt=""
              sizes="(max-width: 859px) 100vw, 701px"
              priority
            />
            <div className={styles.coverBadges}>
              <SportBadge sport={game.sport} label={game.sportLabel} />
              <LevelBadge level={game.level} label={game.levelLabel} />
            </div>
          </div>
          <div className={styles.summary}>
            <h1 id="game-title" className={styles.title}>
              {game.title}
            </h1>
            <ul className={styles.facts}>
              <li>
                <Icon name="calendar" />
                <span className="visually-hidden">Tarix:</span> {game.dateLabel}
              </li>
              <li>
                <Icon name="clock" />
                <span className="visually-hidden">Saat:</span> {game.timeLabel}
              </li>
              {location && (
                <li>
                  <Icon name="pin" />
                  <span className="visually-hidden">Məkan:</span>{' '}
                  {game.venue.id ? (
                    <Link href={`/venues/${game.venue.id}`} className={styles.venueLink}>
                      {location}
                    </Link>
                  ) : (
                    location
                  )}
                </li>
              )}
            </ul>
          </div>
        </section>

        <section className={styles.panel} aria-labelledby="participants-title">
          <h2 id="participants-title" className={styles.panelLabel}>
            İştirakçılar
          </h2>
          <p className={styles.headline}>
            <span className={styles.headlineCount}>{game.currentCount}</span>
            <span className={styles.headlineOf}>/ {game.maxCount} iştirakçı</span>
          </p>
          <ProgressBar value={game.currentCount} max={game.maxCount} label="Doluluq" className={styles.progress} />
          <div className={styles.avatars}>
            {participants.total > 0 ? (
              <PlayersButton
                gameId={game.id}
                gameTitle={game.title}
                people={participants.preview}
                total={participants.total}
                size={34}
                overlap={9}
              />
            ) : (
              <p className={styles.muted}>Hələ heç kim qoşulmayıb. İlk sən ol!</p>
            )}
          </div>
        </section>
      </div>

      <aside className={`${styles.column} ${styles.aside}`} aria-label="Host və qoşulma">
        <section className={styles.panel} aria-labelledby="host-title">
          <h2 id="host-title" className={styles.panelLabel}>
            Host
          </h2>
          {host.id ? (
            <Link href={`/users/${host.id}`} className={`${styles.host} ${styles.hostLink}`}>
              <Avatar person={host} size={42} decorative />
              <span className={styles.hostName}>{host.name}</span>
              <span className={styles.hostArrow} aria-hidden="true">
                →
              </span>
            </Link>
          ) : (
            <div className={styles.host}>
              <Avatar person={host} size={42} decorative />
              <p className={styles.hostName}>{host.name}</p>
            </div>
          )}
          {host.phone ? (
            <>
              {/* Players get a tap-to-call link; the host is looking at their own number, so it is plain text. */}
              {game.viewer.isHost ? (
                <p className={styles.phone}>
                  <span className="visually-hidden">Nömrəniz:</span>
                  {formatPhone(host.phone)}
                </p>
              ) : (
                <a className={styles.phone} href={`tel:${host.phone}`}>
                  <span className="visually-hidden">Hostun nömrəsi:</span>
                  {formatPhone(host.phone)}
                </a>
              )}
              <p className={styles.hostNote}>
                {game.viewer.isHost
                  ? 'Oyunu siz yaratmısınız · Bu nömrə qoşulan oyunçulara görünür'
                  : upcoming
                    ? 'Oyunu yaradıb · Oyuna gələcəyinizi təsdiq etmək üçün host ilə əlaqə saxlayın'
                    : 'Oyunu təşkil edib'}
              </p>
            </>
          ) : (
            <p className={styles.hostNote}>
              {upcoming ? 'Oyunu yaradıb · Əlaqə oyuna qoşulduqdan sonra görünür' : 'Oyunu təşkil edib'}
            </p>
          )}
        </section>

        {game.viewer.isHost && upcoming && (
          <Link href={`/games/${game.id}/edit`} className={buttonClass('outlinePrimary', 'lg', { block: true })}>
            Oyunu redaktə et
          </Link>
        )}

        {/* Keyed like the create form: a page kept mounted since a profile change prefills the new number. */}
        <JoinPanel key={user?.phoneNumber ?? 'no-phone'} game={game} user={user} autoOpen={wantsToJoin && canJoin} />

        {upcoming && (
          <section className={styles.panel} aria-label="Paylaş">
            <ShareButton title={game.title} text={shareText(game)} url={gameUrl} />
            {/* Only for those coming: the calendar reminds them two hours before kick-off. */}
            {(game.viewer.joined || game.viewer.isHost) && (
              <p className={styles.calendarLinks}>
                <a href={`/api/v1/games/${game.id}/calendar`} download>
                  Təqvimə əlavə et
                </a>
                {googleCalendar && (
                  <a href={googleCalendar} target="_blank" rel="noopener noreferrer">
                    Google Calendar
                  </a>
                )}
              </p>
            )}
          </section>
        )}
      </aside>
    </div>
  )
}
