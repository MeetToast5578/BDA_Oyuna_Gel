import type { CollectionConfig } from 'payload'

import { isAdmin } from './access'

/**
 * One row per key ("join:user:12") and time window, counted up atomically by lib/rate-limit.ts.
 * Nothing reads it but that helper; it lives here only so migrations know the table.
 */
export const RateLimits: CollectionConfig = {
  slug: 'rate-limits',
  access: {
    read: isAdmin,
    create: () => false,
    update: () => false,
    delete: isAdmin,
  },
  admin: {
    hidden: true,
  },
  indexes: [{ fields: ['key', 'windowStart'], unique: true }],
  fields: [
    { name: 'key', type: 'text', required: true },
    { name: 'windowStart', type: 'date', required: true, index: true },
    { name: 'count', type: 'number', required: true, defaultValue: 0 },
  ],
}
