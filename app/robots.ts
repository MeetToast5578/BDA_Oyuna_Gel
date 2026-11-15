import type { MetadataRoute } from 'next'

import { SITE_URL } from '@/lib/site-url'

/** Search engines get the public pages; accounts, forms, the admin and the API stay out. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/admin', '/api/', '/profile', '/login', '/games/new', '/teams/new', '/teams/join/', '/games/*/edit'] },
    sitemap: `${SITE_URL}/sitemap.xml`,
  }
}
