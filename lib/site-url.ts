/**
 * The site's own origin, for links read outside it: shared link previews, the sitemap, calendar
 * events. `NEXT_PUBLIC_SITE_URL` wins when set. On Vercel, production uses its domain and a preview
 * its branch URL, so a preview's links point at the preview and not at live data.
 */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_ENV === 'production' && process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : process.env.VERCEL_BRANCH_URL
      ? `https://${process.env.VERCEL_BRANCH_URL}`
      : 'http://localhost:3000')
).replace(/\/$/, '')
