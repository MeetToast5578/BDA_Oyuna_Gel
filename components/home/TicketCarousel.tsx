'use client'

import Link from 'next/link'
import { memo, useCallback, useEffect, useRef, useState } from 'react'

import type { FeaturedGame } from '@/lib/api-types'
import { ProgressBar, SportBadge } from '@/components/games/bits'
import { PlayersButton } from '@/components/games/PlayersButton'
import { buttonClass } from '@/components/ui/button'
import { Icon } from '@/components/ui/Icon'
import styles from './TicketCarousel.module.css'

function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** Scroll position that puts `slide` in the middle of the viewport. */
function centerOf(track: HTMLElement, slide: HTMLElement) {
  return slide.offsetLeft - (track.clientWidth - slide.offsetWidth) / 2
}

/**
 * Hero "ticket" carousel: a native scroll-snap row (so touch swipe just works) with arrows and dots that
 * follow it. It stops at both ends. Keyboard users get the arrows and each card's title and "Qoşul";
 * the dots and the players button still take a click but stay out of the Tab order, so the page's own
 * content is a few stops away rather than thirty.
 */
export function TicketCarousel({ games }: { games: FeaturedGame[] }) {
  const trackRef = useRef<HTMLUListElement>(null)
  const frame = useRef(0)
  const [active, setActive] = useState(0)

  const syncActive = useCallback(() => {
    const track = trackRef.current
    if (!track) return
    const center = track.scrollLeft + track.clientWidth / 2
    let nearest = 0
    let nearestDistance = Number.POSITIVE_INFINITY
    Array.from(track.children as HTMLCollectionOf<HTMLElement>).forEach((slide, index) => {
      const distance = Math.abs(slide.offsetLeft + slide.offsetWidth / 2 - center)
      if (distance < nearestDistance) {
        nearest = index
        nearestDistance = distance
      }
    })
    setActive(nearest)
  }, [])

  useEffect(() => {
    const track = trackRef.current
    if (!track) return
    const onScroll = () => {
      cancelAnimationFrame(frame.current)
      frame.current = requestAnimationFrame(syncActive)
    }
    track.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      cancelAnimationFrame(frame.current)
      track.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [syncActive])

  function goTo(index: number) {
    const track = trackRef.current
    const slide = track?.children[Math.max(0, Math.min(index, games.length - 1))] as HTMLElement | undefined
    if (!track || !slide) return
    track.scrollTo({ left: centerOf(track, slide), behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
  }

  return (
    <div className={styles.carousel} role="region" aria-roledescription="karusel" aria-labelledby="featured-title">
      <h2 id="featured-title" className="visually-hidden">
        Seçilmiş oyunlar
      </h2>
      <div className={styles.viewport}>
        <ul ref={trackRef} className={styles.track} tabIndex={0} aria-label="Oyunlar, sürüşdürün">
          {games.map((game, index) => (
            <li key={game.id} className={styles.slide} aria-roledescription="slayd" aria-label={`${index + 1} / ${games.length}`}>
              <Ticket game={game} />
            </li>
          ))}
        </ul>
      </div>

      {games.length > 1 && (
        <div className={styles.controls}>
          <button type="button" className={styles.arrow} onClick={() => goTo(active - 1)} disabled={active === 0} aria-label="Əvvəlki oyun">
            <Icon name="chevron" className={styles.flip} />
          </button>
          <ul className={styles.dots}>
            {games.map((game, index) => (
              <li key={game.id}>
                <button
                  type="button"
                  className={styles.dot}
                  tabIndex={-1}
                  onClick={() => goTo(index)}
                  aria-label={`${index + 1}. oyuna keç`}
                  aria-current={index === active ? 'true' : undefined}
                />
              </li>
            ))}
          </ul>
          <button
            type="button"
            className={styles.arrow}
            onClick={() => goTo(active + 1)}
            disabled={active === games.length - 1}
            aria-label="Növbəti oyun"
          >
            <Icon name="chevron" />
          </button>
        </div>
      )}
    </div>
  )
}

/** Memoised: the carousel re-renders whenever the centred card changes, mid-swipe. */
const Ticket = memo(function Ticket({ game }: { game: FeaturedGame }) {
  const href = `/games/${game.id}`
  const place = [game.venue.name, [game.venue.district, game.venue.cityLabel].filter(Boolean).join(', ')]
    .filter(Boolean)
    .join(' · ')

  return (
    <article className={styles.ticket}>
      <div className={styles.ticketTop}>
        <span className={styles.when}>
          <span className={styles.whenDot} aria-hidden="true" />
          {game.relativeTimeLabel}
        </span>
        <SportBadge sport={game.sport} label={game.sportLabel} solid />
      </div>

      <div className={styles.ticketBody}>
        <div className={styles.info}>
          <div className={styles.meta}>
            <h3 className={styles.ticketTitle}>
              <Link href={href}>
                {game.title}
              </Link>
            </h3>
            <p className={styles.ticketSub}>{[place, game.levelLabel].filter(Boolean).join(' · ')}</p>
          </div>
          <div className={styles.attendance}>
            <p className={styles.attendanceText}>
              <span className={styles.count}>{game.currentCount}</span>
              <span className={styles.of}>/ {game.maxCount} iştirakçı</span>
            </p>
            <ProgressBar
              value={game.currentCount}
              max={game.maxCount}
              label="Doluluq"
              className={styles.progress}
            />
          </div>
        </div>

        <div className={styles.ticketFooter}>
          <PlayersButton
            gameId={game.id}
            gameTitle={game.title}
            people={game.participants.preview}
            total={game.participants.total}
            size={36}
            overlap={8}
            moreStyle={{ bg: '#cee9d9', color: '#082016' }}
            className={styles.players}
            tabIndex={-1}
          />
          {/* Not prefetched, like the "Qoşul" on game cards: the title link already covers this game. */}
          <Link
            href={`${href}?join=1`}
            prefetch={false}
            className={buttonClass('white', 'md', { className: styles.join })}
            aria-label={`${game.title} oyununa qoşul`}
          >
            Qoşul
          </Link>
        </div>
      </div>
    </article>
  )
})
