export const CONSENT_COOKIE = 'oyuna_analytics_consent'
export const LOGIN_COOKIE = 'oyuna_analytics_login'
export const MEASUREMENT_ID = /^G-[A-Z0-9]+$/.test(process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID ?? '')
  ? process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID!
  : ''

declare global {
  interface Window {
    dataLayer?: unknown[]
    gtag?: (...args: unknown[]) => void
  }
}

export function readCookie(name: string) {
  return document.cookie.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1)
}

/** Only route templates leave the browser: no search terms, invite codes, IDs or hashes. */
export function analyticsPath(path: string) {
  const clean = path.split(/[?#]/)[0]
  if (/^\/games\/[^/]+\/edit\/?$/.test(clean)) return '/games/:id/edit'
  if (/^\/teams\/join\/[^/]+\/?$/.test(clean)) return '/teams/join/:code'
  if (/^\/(games|users|teams|venues)\/[^/]+\/?$/.test(clean) && !/\/(new|past|suggest)$/.test(clean)) {
    return clean.replace(/\/[^/]+\/?$/, '/:id')
  }
  const known = ['/', '/games', '/games/new', '/games/past', '/teams', '/teams/new', '/venues', '/venues/suggest', '/leaderboard', '/profile', '/notifications', '/login', '/about', '/rules', '/privacy', '/contact']
  return known.includes(clean) ? clean : '/other'
}

export function sportValue(sport: string | null) {
  return sport && ['football', 'basketball', 'tennis'].includes(sport) ? sport : 'all'
}

export function analyticsEnabled() {
  return Boolean(MEASUREMENT_ID) && typeof window !== 'undefined' && readCookie(CONSENT_COOKIE) === 'granted'
}

export function initialiseAnalytics(path: string) {
  if (!analyticsEnabled() || window.gtag) return
  window.dataLayer = []
  // Match Google's gtag queue format (an Arguments object, not an event array).
  // eslint-disable-next-line prefer-rest-params
  window.gtag = function () { window.dataLayer!.push(arguments) }
  window.gtag('consent', 'default', {
    analytics_storage: 'granted', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied',
  })
  window.gtag('js', new Date())
  window.gtag('config', MEASUREMENT_ID, {
    send_page_view: false,
    page_location: `${window.location.origin}${analyticsPath(path)}`,
    page_referrer: '', page_title: 'OyunaGəl',
    allow_google_signals: false, allow_ad_personalization_signals: false,
  })
}

export function trackPage(path: string) {
  if (!analyticsEnabled()) return
  window.gtag?.('event', 'page_view', {
    page_location: `${window.location.origin}${analyticsPath(path)}`,
    page_referrer: '', page_title: 'OyunaGəl',
  })
}

type ActionEvent =
  | 'game_created' | 'game_joined' | 'waitlist_joined' | 'sport_selected' | 'login'
  | 'venue_map_opened' | 'venue_call' | 'venue_whatsapp' | 'venue_booking'

/** `value` is the sport, or for the `venue_*` events the venue's numeric id (a public page, not a person). */
export function trackAction(event: ActionEvent, value?: string | null) {
  // Analytics must never turn a successful application action into an error.
  try {
    if (!analyticsEnabled()) return
    const params =
      event === 'login'
        ? { method: 'Google' }
        : event.startsWith('venue_')
          ? { venue_id: /^\d+$/.test(value ?? '') ? value : 'unknown' }
          : { sport: sportValue(value ?? null) }
    window.gtag?.('event', event, params)
  } catch { /* Optional analytics can be blocked by the browser. */ }
}

export function saveConsent(value: 'granted' | 'denied') {
  document.cookie = `${CONSENT_COOKIE}=${value}; Path=/; Max-Age=15552000; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`
  const flags = window as unknown as Record<string, unknown>
  flags[`ga-disable-${MEASUREMENT_ID}`] = value !== 'granted'
  if (value === 'denied') {
    // Remove host-only and parent-domain GA cookies created by this property.
    const names = document.cookie.split(';').map((part) => part.trim().split('=')[0]).filter((name) => name === '_ga' || name.startsWith('_ga_'))
    const parts = location.hostname.split('.')
    const domains = ['', ...parts.map((_, index) => parts.slice(index).join('.'))]
    for (const name of names) for (const domain of domains) {
      document.cookie = `${name}=; Max-Age=0; Path=/${domain ? `; Domain=${domain}` : ''}`
    }
  }
  window.dispatchEvent(new Event('oyuna-consent'))
}
