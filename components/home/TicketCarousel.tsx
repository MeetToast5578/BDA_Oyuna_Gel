'use client'

import Link from 'next/link'
import { memo, useCallback, useEffect, useRef, useState } from 'react'

import type { FeaturedGame } from '@/lib/api-types'
import { ProgressBar, SportBadge } from '@/components/games/bits'
import { PlayersButton } from '@/components/games/PlayersButton'
import { buttonClass } from '@/components/ui/button'
import { Icon } from '@/components/ui/Icon'
import styles from './TicketCarousel.module.css'

/**
 * The games are rendered three times over, so the track always holds a full copy of buffer on either
 * side of the real one. Scrolling off an edge therefore lands on identical content, which lets us
 * shift the scroll position back by a whole copy once scrolling settles. That shift is invisible —
 * the same cards sit in the same places — and it is what makes the loop seamless in both directions.
 */
const COPIES = 3
/** Scrolling counts as finished this long after the last scroll event. */
const SETTLE_MS = 150

function slidesOf(track: HTMLElement | null) {
  return Array.from(track?.children ?? []) as HTMLElement[]
}

function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** Scroll position that puts `slide` in the middle of the viewport. */
function centerOf(track: HTMLElement, slide: HTMLElement) {
  return slide.offsetLeft - (track.clientWidth - slide.offsetWidth) / 2
}

/** Hero "ticket" carousel: native scroll-snap (so touch swipe just works) with synced arrows and dots. */
export function TicketCarousel({ games }: { games: FeaturedGame[] }) {
  const trackRef = useRef<HTMLUListElement>(null)
  const frame = useRef(0)
  const settle = useRef<ReturnType<typeof setTimeout>>(undefined)
  const dragging = useRef(false)

  // A single game has nothing to loop through, so it skips the clones and stays a plain one-card track.
  const loops = games.length > 1
  /** Index of the first slide of the middle copy — the real, non-cloned one. */
  const offset = loops ? games.length : 0
  // Before hydration the track is still at scrollLeft 0, which centres slide 0. Slide 0 shows the same
  // game as slide `offset`, so the effect below moving there is invisible.
  const [active, setActive] = useState(0)
  const activeRef = useRef(0)
  /**
   * Where an arrow/dot scroll is heading, until it settles. Mid-scroll the centred slide still lags
   * behind it, so stepping from that would repeat a card, or redo a jump goTo() has already made.
   */
  const targetRef = useRef<number | null>(null)

  const syncActive = useCallback(() => {
    const track = trackRef.current
    if (!track) return
    const center = track.scrollLeft + track.clientWidth / 2
    let nearest = 0
    let nearestDistance = Number.POSITIVE_INFINITY
    slidesOf(track).forEach((slide, index) => {
      const distance = Math.abs(slide.offsetLeft + slide.offsetWidth / 2 - center)
      if (distance < nearestDistance) {
        nearest = index
        nearestDistance = distance
      }
    })
    activeRef.current = nearest
    setActive(nearest)
  }, [])

  /**
   * Shifts the scroll position by whole copies until it sits in the middle one again. Only ever runs
   * once scrolling has stopped: moving `scrollLeft` mid-animation would cancel a smooth scroll.
   */
  const recenter = useCallback(() => {
    const track = trackRef.current
    const items = slidesOf(track)
    const first = items[offset]
    if (!track || !loops || !first || !items[0]) return

    const copyWidth = first.offsetLeft - items[0].offsetLeft
    if (copyWidth <= 0) return

    const base = centerOf(track, first)
    const drift = track.scrollLeft - base
    // Modulo rather than a single step, so even a long flick past the buffer lands back in the middle.
    const wrapped = ((drift % copyWidth) + copyWidth) % copyWidth
    if (Math.abs(wrapped - drift) < 1) return

    track.scrollLeft = base + wrapped
    syncActive()
  }, [loops, offset, syncActive])

  // Start on the middle copy, so there is somewhere to go in both directions from the very first swipe.
  useEffect(() => {
    const track = trackRef.current
    const slide = slidesOf(track)[offset]
    if (!track || !slide) return
    track.scrollLeft = centerOf(track, slide)
    syncActive()
  }, [offset, syncActive])

  useEffect(() => {
    const track = trackRef.current
    if (!track) return

    const scheduleSettle = () => {
      clearTimeout(settle.current)
      // A finger still on the screen owns the scroll position; recentring waits until it lifts.
      settle.current = setTimeout(() => {
        if (dragging.current) return
        // goTo() may have switched snapping off for a jump; at rest, on a card, it is safe to restore.
        track.style.scrollSnapType = ''
        targetRef.current = null
        recenter()
      }, SETTLE_MS)
    }
    const onScroll = () => {
      cancelAnimationFrame(frame.current)
      frame.current = requestAnimationFrame(syncActive)
      scheduleSettle()
    }
    // Touch events, not pointer events: the browser fires `pointercancel` as soon as it takes over the
    // pan, so a pointer-based flag would clear while the finger is still down.
    const onTouchStart = () => {
      dragging.current = true
      targetRef.current = null
    }
    const onTouchEnd = () => {
      dragging.current = false
      scheduleSettle()
    }
    const onResize = () => {
      // --slide-w is viewport-relative: keep the active card centred instead of letting it drift.
      const slide = slidesOf(track)[activeRef.current]
      if (slide) track.scrollLeft = centerOf(track, slide)
      syncActive()
    }

    track.addEventListener('scroll', onScroll, { passive: true })
    track.addEventListener('touchstart', onTouchStart, { passive: true })
    window.addEventListener('touchend', onTouchEnd, { passive: true })
    window.addEventListener('touchcancel', onTouchEnd, { passive: true })
    window.addEventListener('resize', onResize)
    return () => {
      cancelAnimationFrame(frame.current)
      clearTimeout(settle.current)
      track.removeEventListener('scroll', onScroll)
      track.removeEventListener('touchstart', onTouchStart)
      window.removeEventListener('touchend', onTouchEnd)
      window.removeEventListener('touchcancel', onTouchEnd)
      window.removeEventListener('resize', onResize)
    }
  }, [recenter, syncActive])

  function goTo(index: number) {
    const track = trackRef.current
    const items = slidesOf(track)
    // Clicks faster than the scroll settles never give recenter() its turn, so stepping through the
    // track directly would drift into the buffer copy and stall at its far end. Every target is
    // therefore taken back into the middle copy, jumping the track by whole copies first: invisible,
    // since the same cards sit in the same places.
    const target = loops ? offset + ((((index - offset) % games.length) + games.length) % games.length) : index
    const slide = items[target]
    if (!track || !slide) return
    const copies = (target - index) / games.length
    if (copies !== 0 && items[offset] && items[0]) {
      // Mid-scroll the position sits between cards, and snapping would yank it onto one: a visible
      // jump. Off until the scroll settles (see scheduleSettle).
      track.style.scrollSnapType = 'none'
      track.scrollLeft += copies * (items[offset].offsetLeft - items[0].offsetLeft)
    }
    targetRef.current = target
    track.scrollTo({ left: centerOf(track, slide), behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
  }

  /** The slide arrows and dots move from: the one being scrolled to, else the one centred. */
  const from = () => targetRef.current ?? activeRef.current
  /** Which game is showing, regardless of the copy it came from. */
  const current = loops ? active % games.length : active
  /** Steps to a game within the copy already on screen, so a dot never scrolls the whole track. */
  const goToGame = (gameIndex: number) => goTo(from() - (from() % games.length) + gameIndex)

  return (
    <div className={styles.carousel} role="region" aria-roledescription="karusel" aria-labelledby="featured-title">
      <h2 id="featured-title" className="visually-hidden">
        Seçilmiş oyunlar
      </h2>
      <div className={styles.viewport}>
        <ul ref={trackRef} className={styles.track} tabIndex={0} aria-label="Oyunlar, sürüşdürün">
          {Array.from({ length: games.length * (loops ? COPIES : 1) }, (_, index) => {
            // The buffer copies are decoration: hidden from screen readers and skipped by Tab.
            // They must still take a click, though. `inert` would have been the tidy way to do both,
            // but it kills pointer events too, and a buffer card is pixel-identical to the real one:
            // the track renders at scroll position 0 (a buffer card, dead centre) until hydration
            // moves it, and any scroll can settle on one. Cards that look clickable have to be.
            const clone = index < offset || index >= offset + games.length
            return (
              <li
                key={index}
                className={styles.slide}
                aria-roledescription={clone ? undefined : 'slayd'}
                aria-label={clone ? undefined : `${(index % games.length) + 1} / ${games.length}`}
                aria-hidden={clone || undefined}
              >
                <Ticket game={games[index % games.length]} clone={clone} />
              </li>
            )
          })}
        </ul>
      </div>

      {loops && (
        <div className={styles.controls}>
          <button type="button" className={styles.arrow} onClick={() => goTo(from() - 1)} aria-label="Əvvəlki oyun">
            <Icon name="chevron" className={styles.flip} />
          </button>
          <ul className={styles.dots}>
            {games.map((game, index) => (
              <li key={game.id}>
                <button
                  type="button"
                  className={styles.dot}
                  onClick={() => goToGame(index)}
                  aria-label={`${index + 1}. oyuna keç`}
                  aria-current={index === current ? 'true' : undefined}
                />
              </li>
            ))}
          </ul>
          <button type="button" className={styles.arrow} onClick={() => goTo(from() + 1)} aria-label="Növbəti oyun">
            <Icon name="chevron" />
          </button>
        </div>
      )}
    </div>
  )
}

/** Memoised: the carousel re-renders whenever the centred card changes, mid-swipe. */
const Ticket = memo(function Ticket({ game, clone }: { game: FeaturedGame; clone: boolean }) {
  const href = `/games/${game.id}`
  // A buffer copy still takes a click, but it is not a second Tab stop for the same game, and its
  // `aria-hidden` wrapper must not contain anything focusable.
  const tabIndex = clone ? -1 : undefined
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
              <Link href={href} tabIndex={tabIndex}>
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
            tabIndex={tabIndex}
          />
          {/* Not prefetched, like the "Qoşul" on game cards: the title link already covers this game. */}
          <Link
            href={`${href}?join=1`}
            prefetch={false}
            className={buttonClass('white', 'md', { className: styles.join })}
            aria-label={`${game.title} oyununa qoşul`}
            tabIndex={tabIndex}
          >
            Qoşul
          </Link>
        </div>
      </div>
    </article>
  )
})
