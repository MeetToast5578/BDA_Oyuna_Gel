'use client'

import type { ReactNode } from 'react'

import { trackAction } from '@/lib/analytics'

/** "Xəritədə aç": counts the click (venue id only) so a venue's monthly report can show it. */
export function MapLink({ href, venueId, className, children }: { href: string; venueId: string; className?: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={className} onClick={() => trackAction('venue_map_opened', venueId)}>
      {children}
    </a>
  )
}
