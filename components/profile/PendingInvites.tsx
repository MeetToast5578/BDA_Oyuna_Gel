import Link from 'next/link'

import detail from '@/components/games/GameDetail.module.css'
import styles from '@/components/games/Invites.module.css'
import { buttonClass } from '@/components/ui/button'
import type { myInvites } from '@/lib/invites'
import { DeclineInvite } from './DeclineInvite'

/**
 * "Dəvətlər": games a host invited the signed-in player to. "Bax və qoşul" opens the game with the
 * join form on the invited side, since joining is how an invite is accepted; "Rədd et" turns it down.
 * Not rendered at all when nothing is waiting.
 */
export function PendingInvites({ invites }: { invites: Awaited<ReturnType<typeof myInvites>> }) {
  if (invites.length === 0) return null
  return (
    <section className={detail.panel} aria-labelledby="invites-title">
      <h2 id="invites-title" className={detail.panelLabel}>
        Dəvətlər · {invites.length}
      </h2>
      <ul className={styles.invites}>
        {invites.map((invite) => (
          <li key={invite.id} className={styles.invite}>
            <span className={styles.inviteText}>
              <span className={styles.inviteTitle}>{invite.title}</span>
              <span className={styles.sub}>
                {invite.sportLabel} · {invite.dateLabel}, {invite.timeLabel}
                {invite.venueName ? ` · ${invite.venueName}` : ''}
              </span>
              <span className={styles.sub}>
                {invite.hostName ? `${invite.hostName} sizi dəvət edib` : 'Dəvət olunmusunuz'} · {invite.sideLabel}
              </span>
            </span>
            <span className={styles.actions}>
              <Link href={`/games/${invite.gameId}?join=1&side=${invite.side}`} className={buttonClass('primary', 'sm')}>
                Bax və qoşul
              </Link>
              <DeclineInvite inviteId={invite.id} title={invite.title} />
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
