'use client'

import type { ReactNode } from 'react'

import { trackAction } from '@/lib/analytics'

/**
 * A venue page's outbound link ("Xəritədə aç", "Zəng et", "WhatsApp", "Bron et") that counts the click
 * with the venue id only, so a partner's monthly report can show it.
 */
export function TrackedLink({
  href,
  venueId,
  event,
  className,
  children,
}: {
  href: string
  venueId: string
  event: 'venue_map_opened' | 'venue_call' | 'venue_whatsapp' | 'venue_booking'
  className?: string
  children: ReactNode
}) {
  // A phone call stays in the same tab; web links open a new one.
  const external = !href.startsWith('tel:')
  return (
    <a
      href={href}
      {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
      className={className}
      onClick={() => trackAction(event, venueId)}
    >
      {children}
    </a>
  )
}
