'use client'

import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
import { useEffect, useRef } from 'react'

import styles from './VenueMap.module.css'

export type VenuePin = { id: string; name: string; place: string; sports: string; lat: number; lng: number }

/** Baku, for a map with no pins yet. */
const BAKU: [number, number] = [40.4093, 49.8671]

/**
 * The venues on an OpenStreetMap map, each a dot whose popup links to the venue's page. Popups are
 * built from DOM nodes, not HTML strings, so a venue name can never inject markup.
 */
export default function VenueMap({ pins }: { pins: VenuePin[] }) {
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!box.current) return
    const map = L.map(box.current, { scrollWheelZoom: false }).setView(BAKU, 11)
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map)

    const color = getComputedStyle(box.current).getPropertyValue('--color-win').trim() || '#4433d6'
    for (const pin of pins) {
      const popup = document.createElement('div')
      const link = Object.assign(document.createElement('a'), { href: `/venues/${pin.id}`, textContent: pin.name, className: styles.popupTitle })
      const place = Object.assign(document.createElement('p'), { textContent: pin.place, className: styles.popupText })
      const sports = Object.assign(document.createElement('p'), { textContent: pin.sports, className: styles.popupText })
      popup.append(link, place, sports)
      L.circleMarker([pin.lat, pin.lng], { radius: 9, color: '#fff', weight: 2, fillColor: color, fillOpacity: 1 })
        .bindPopup(popup)
        .bindTooltip(pin.name)
        .addTo(map)
    }
    if (pins.length > 1) map.fitBounds(L.latLngBounds(pins.map((pin) => [pin.lat, pin.lng])), { padding: [32, 32] })
    else if (pins.length === 1) map.setView([pins[0].lat, pins[0].lng], 14)
    return () => {
      map.remove()
    }
  }, [pins])

  return <div ref={box} className={styles.map} role="region" aria-label="Meydançaların xəritəsi" />
}
