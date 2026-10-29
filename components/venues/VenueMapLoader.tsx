'use client'

import dynamic from 'next/dynamic'

import type { VenuePin } from './VenueMap'

/** Leaflet needs `window`, so the map loads in the browser only, after the page; a box holds its place meanwhile. */
const VenueMap = dynamic(() => import('./VenueMap'), {
  ssr: false,
  loading: () => <div className="skeleton" style={{ width: '100%', height: 'min(70vh, 560px)', minHeight: 360 }} />,
})

export function VenueMapLoader({ pins }: { pins: VenuePin[] }) {
  return <VenueMap pins={pins} />
}
