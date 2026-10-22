const PROBE_ORIGIN = 'http://same-site.invalid'

/**
 * Returns `next` if it is a same-site path ("/games/12"), else `fallback`. The path is resolved the
 * way a browser would, so "//evil.com", "/\evil.com" and "/<tab>/evil.com" (URL parsing drops tabs
 * and newlines) are all caught by the origin check.
 */
export function safeRedirectPath(next: unknown, fallback = '/') {
  if (typeof next !== 'string' || !next.startsWith('/')) return fallback
  try {
    const url = new URL(next, PROBE_ORIGIN)
    return url.origin === PROBE_ORIGIN ? url.pathname + url.search + url.hash : fallback
  } catch {
    return fallback
  }
}

export function loginHref(next: string) {
  return `/login?next=${encodeURIComponent(next)}`
}
