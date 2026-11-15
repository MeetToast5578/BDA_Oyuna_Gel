import type { CSSProperties } from 'react'

import formStyles from '@/components/create/GameForm.module.css'
import carousel from '@/components/home/TicketCarousel.module.css'
import profile from '@/components/profile/Profile.module.css'
import form from '@/components/ui/form.module.css'
import segmented from '@/components/ui/segmented.module.css'
import card from './GameCard.module.css'
import detail from './GameDetail.module.css'
import grid from './GamesGrid.module.css'
import section from './GamesSection.module.css'
import sk from './skeletons.module.css'
import tabs from './SportTabs.module.css'

/*
 * Loading placeholders shown while a page's data streams in. Each one is built from the real
 * component's own layout classes, so it takes up the same space and nothing jumps when the content
 * replaces it. All of them are decorative: the page's own heading says what is loading.
 */

function Bone({ className = '', style }: { className?: string; style?: CSSProperties }) {
  return <span className={`skeleton ${className}`} style={style} />
}

export function GameCardSkeleton() {
  return (
    <div className={`${card.card} ${sk.inert}`}>
      <div className={card.media}>
        <Bone className={sk.fill} />
      </div>
      <div className={card.body}>
        <div className={card.meta}>
          <Bone className={sk.lineLg} style={{ width: '72%' }} />
          <Bone className={sk.line} style={{ width: '55%' }} />
        </div>
        <Bone className={sk.line} style={{ width: '48%' }} />
        <div className={card.progress}>
          <div className={card.progressLabels}>
            <Bone className={sk.line} style={{ width: 72, height: 12 }} />
            <Bone className={sk.line} style={{ width: 64, height: 12 }} />
          </div>
          <Bone className={sk.bar} />
        </div>
        <div className={card.footer}>
          <div className={card.host}>
            <Bone className={sk.circle} style={{ width: 32, height: 32 }} />
            <Bone className={sk.line} style={{ width: 90, height: 12 }} />
          </div>
          <Bone className={sk.pill} style={{ width: 90 }} />
        </div>
      </div>
    </div>
  )
}

export function GamesGridSkeleton({ count }: { count: number }) {
  return (
    <div className={grid.wrapper}>
      <ul className={grid.grid}>
        {Array.from({ length: count }, (_, index) => (
          <li key={index}>
            <GameCardSkeleton />
          </li>
        ))}
      </ul>
    </div>
  )
}

export function SportTabsSkeleton() {
  return (
    <ul className={tabs.tabs}>
      {[0, 1, 2].map((index) => (
        <li key={index}>
          <span className={`${tabs.tab} ${sk.inert}`}>
            {/* Heights of the real emoji, label and count lines, so the row doesn't jump. */}
            <Bone className={sk.tabEmoji} />
            <Bone className={sk.line} style={{ width: 70, height: 18 }} />
            <Bone className={sk.line} style={{ width: 64, height: 15 }} />
          </span>
        </li>
      ))}
    </ul>
  )
}

/** `/teams` before its clubs arrive: the sport tabs and a grid of club cards, so the footer stays put. */
export function TeamListSkeleton() {
  return (
    <div aria-busy="true">
      <SportTabsSkeleton />
      <ul className={grid.grid}>
        {Array.from({ length: 6 }, (_, index) => (
          <li key={index}>
            <div className={`${card.card} ${sk.inert}`}>
              <div className={card.body}>
                <div className={card.meta}>
                  <Bone className={sk.line} style={{ width: '60%', height: 22 }} />
                  <Bone className={sk.line} style={{ width: 50, height: 15 }} />
                </div>
                <Bone className={sk.line} style={{ width: 80, height: 24 }} />
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * The shape of `GamesSection` before its data arrives. The title is known up front, so it is real
 * text rather than a placeholder; only the tab counters, the filter line and the cards shimmer.
 */
export function GamesSectionSkeleton({
  id,
  eyebrow,
  title,
  titleLevel = 'h2',
  cards,
  backLink,
  whenLinks = false,
}: {
  id?: string
  eyebrow?: string
  title: string
  titleLevel?: 'h1' | 'h2'
  cards: number
  backLink?: React.ReactNode
  /** The "Qarşıdakı / Keçmiş" switch of the two list pages. */
  whenLinks?: boolean
}) {
  const Heading = titleLevel
  const standalone = titleLevel === 'h1'
  const head = (
    <div className={section.head}>
      <div className={section.headText}>
        {eyebrow && <p className={section.eyebrow}>{eyebrow}</p>}
        <Heading className={section.title}>{title}</Heading>
        <Bone className={sk.line} style={{ width: 230, height: 20, marginBlock: 2 }} />
      </div>
      {whenLinks && (
        <div className={segmented.segments}>
          <Bone style={{ height: 40, borderRadius: 10 }} />
          <Bone style={{ height: 40, borderRadius: 10 }} />
        </div>
      )}
    </div>
  )

  return (
    <section id={id} className={`container ${section.section}`} aria-busy="true">
      {standalone && (
        <div className={section.intro}>
          {backLink}
          {head}
        </div>
      )}
      <SportTabsSkeleton />
      <div className={section.games}>
        {!standalone && head}
        <GamesGridSkeleton count={cards} />
      </div>
    </section>
  )
}

/** Three glass tickets, the middle one in focus, sized like the real carousel so the hero doesn't grow. */
export function TicketCarouselSkeleton() {
  return (
    <div className={`${carousel.carousel} ${carousel.skeleton} skeleton-on-dark`} aria-hidden="true">
      <div className={carousel.viewport}>
        <div className={carousel.skeletonTrack}>
          {[0, 1, 2].map((index) => (
            <div key={index} className={`${carousel.ticket} ${carousel.skeletonTicket}`} data-side={index !== 1}>
              <div className={carousel.ticketTop}>
                <Bone style={{ width: 96, height: 27, borderRadius: 99 }} />
                <Bone style={{ width: 84, height: 27, borderRadius: 99 }} />
              </div>
              <div className={carousel.ticketBody}>
                <div className={sk.stack}>
                  <Bone className={sk.lineLg} style={{ width: '62%' }} />
                  <Bone className={sk.line} style={{ width: '80%' }} />
                  <Bone style={{ width: 110, height: 38, marginTop: 4 }} />
                  <Bone className={sk.bar} />
                </div>
                <div className={carousel.ticketFooter}>
                  <div className={sk.row} style={{ gap: 0 }}>
                    {[0, 1, 2, 3].map((dot) => (
                      <Bone
                        key={dot}
                        className={sk.circle}
                        style={{ width: 36, height: 36, marginLeft: dot ? -8 : 0 }}
                      />
                    ))}
                  </div>
                  <Bone style={{ width: 139, height: 40 }} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className={carousel.controls}>
        <Bone className={sk.circle} style={{ width: 48, height: 48 }} />
        <div className={sk.dots}>
          {[0, 1, 2, 3, 4].map((dot) => (
            <Bone key={dot} className={sk.circle} style={{ width: 12, height: 12 }} />
          ))}
        </div>
        <Bone className={sk.circle} style={{ width: 48, height: 48 }} />
      </div>
    </div>
  )
}

/** "Oyun Detalı" below its page title: the cover card and participants on the left, host and join on the right. */
export function GameDetailSkeleton() {
  return (
    <div className={detail.layout} aria-busy="true">
      <div className={detail.column}>
        <div className={detail.card}>
          <div className={detail.cover}>
            <Bone className={sk.fill} />
          </div>
          <div className={detail.summary}>
            <Bone className={sk.lineXl} style={{ width: '64%', height: 46 }} />
            <div className={sk.row}>
              <Bone className={sk.line} style={{ width: 110 }} />
              <Bone className={sk.line} style={{ width: 60 }} />
              <Bone className={sk.line} style={{ width: 150 }} />
            </div>
          </div>
        </div>
        <div className={detail.panel}>
          <Bone className={sk.line} style={{ width: 110 }} />
          <Bone style={{ width: 140, height: 34 }} />
          <Bone className={sk.bar} style={{ height: 8 }} />
          <div className={sk.row} style={{ gap: 0, paddingTop: 8 }}>
            {[0, 1, 2, 3, 4].map((dot) => (
              <Bone key={dot} className={sk.circle} style={{ width: 34, height: 34, marginLeft: dot ? -9 : 0 }} />
            ))}
          </div>
        </div>
      </div>
      <div className={`${detail.column} ${detail.aside}`}>
        <div className={detail.panel}>
          <Bone className={sk.line} style={{ width: 50 }} />
          <div className={sk.row}>
            <Bone className={sk.circle} style={{ width: 42, height: 42 }} />
            <Bone className={sk.line} style={{ width: 140 }} />
          </div>
          <Bone className={sk.line} style={{ width: '85%', height: 12 }} />
        </div>
        <Bone className={sk.block} style={{ height: 56 }} />
      </div>
    </div>
  )
}

function FieldSkeleton({ labelWidth = 90, height = 40 }: { labelWidth?: number; height?: number }) {
  return (
    <div className={form.field}>
      <Bone className={sk.line} style={{ width: labelWidth, height: 13 }} />
      <Bone style={{ height, borderRadius: 10 }} />
    </div>
  )
}

/** The create/edit form's cards, while the session and (when editing) the game load. */
export function GameFormSkeleton() {
  return (
    <div className={formStyles.form} aria-busy="true">
      <div className={formStyles.main}>
        <div className={formStyles.section}>
          <div className={form.row}>
            <FieldSkeleton labelWidth={100} />
            <FieldSkeleton labelWidth={130} />
          </div>
        </div>
        <div className={formStyles.section}>
          <div className={form.field}>
            <Bone className={sk.line} style={{ width: 80, height: 13 }} />
            <div className={formStyles.choices}>
              {[0, 1, 2].map((index) => (
                <Bone key={index} style={{ height: 88, borderRadius: 'var(--radius-lg)' }} />
              ))}
            </div>
          </div>
          <FieldSkeleton labelWidth={70} />
          <div className={form.row}>
            <FieldSkeleton labelWidth={50} />
            <FieldSkeleton labelWidth={50} />
          </div>
          <div className={formStyles.counts}>
            <FieldSkeleton labelWidth={140} />
            <FieldSkeleton labelWidth={150} />
          </div>
          <FieldSkeleton labelWidth={110} />
          <FieldSkeleton labelWidth={150} />
        </div>
      </div>
      <Bone className={sk.block} style={{ height: 52 }} />
    </div>
  )
}

/** The identity panel of either profile page: photo, name and a few facts. */
function ProfileIdentitySkeleton({ facts, action }: { facts: number; action: boolean }) {
  return (
    <div className={`${detail.panel} ${profile.identity}`}>
      <Bone className={sk.circle} style={{ width: 96, height: 96 }} />
      <div className={profile.identityText}>
        <Bone className={sk.lineLg} style={{ width: 220, height: 30 }} />
        <div className={sk.stack} style={{ gap: 12, paddingTop: 4 }}>
          {Array.from({ length: facts }, (_, index) => (
            <Bone key={index} className={sk.line} style={{ width: [190, 150, 170][index % 3] }} />
          ))}
        </div>
        {action && <Bone className={sk.pill} style={{ width: 176, height: 42, marginTop: 8 }} />}
      </div>
    </div>
  )
}

function StatTilesSkeleton({ count }: { count: number }) {
  return (
    <div className={profile.tiles} style={{ '--tiles': count } as CSSProperties}>
      {Array.from({ length: count }, (_, index) => (
        // The real tile's number (30px × 1.25) and label line, so the panel keeps its height.
        <div key={index} className={sk.stack} style={{ gap: 4 }}>
          <Bone style={{ width: 44, height: 38 }} />
          <Bone className={sk.line} style={{ width: '75%', height: 14 }} />
        </div>
      ))}
    </div>
  )
}

/** "Profilim" below its title: identity and stats, then the games tabs and the first cards. */
export function ProfileSkeleton() {
  return (
    <>
      <div className={profile.overview} aria-busy="true">
        <ProfileIdentitySkeleton facts={3} action />
        <div className={detail.panel}>
          <Bone className={sk.line} style={{ width: 96, height: 17 }} />
          <StatTilesSkeleton count={3} />
          <hr className={profile.divider} />
          <div className={profile.sports}>
            {[0, 1, 2].map((index) => (
              <div key={index} className={profile.sport} style={{ minHeight: 20 }}>
                <Bone className={sk.line} style={{ width: 90 }} />
                <Bone className={sk.bar} style={{ height: 8 }} />
                <Bone className={sk.line} style={{ width: 16, justifySelf: 'end' }} />
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className={profile.games} aria-busy="true">
        <h2 className={section.title}>Mənim oyunlarım</h2>
        <div className={profile.tabs}>
          <ul className={profile.roleTabs}>
            {[0, 1].map((index) => (
              <li key={index}>
                <span className={`${tabs.tab} ${sk.inert}`}>
                  <Bone className={sk.tabEmoji} />
                  <Bone className={sk.line} style={{ width: 150, height: 18 }} />
                  <Bone className={sk.line} style={{ width: 110, height: 15 }} />
                </span>
              </li>
            ))}
          </ul>
          <div className={segmented.segments}>
            <Bone style={{ height: 40, borderRadius: 10 }} />
            <Bone style={{ height: 40, borderRadius: 10 }} />
          </div>
        </div>
        <GamesGridSkeleton count={3} />
      </div>
    </>
  )
}

/** A player's public profile below its page label: identity and hosting stats, then their games. */
export function PublicProfileSkeleton() {
  return (
    <>
      <div className={profile.overview} aria-busy="true">
        <ProfileIdentitySkeleton facts={1} action={false} />
        <div className={detail.panel}>
          <Bone className={sk.line} style={{ width: 96, height: 17 }} />
          <StatTilesSkeleton count={2} />
        </div>
      </div>
      <div className={profile.hosted} aria-busy="true">
        <Bone className={sk.lineLg} style={{ width: 260, height: 34 }} />
        <GamesGridSkeleton count={3} />
      </div>
    </>
  )
}
