import type { CollectionConfig } from 'payload'

import { isAdmin } from './access'

/** What happened, for `/notifications`; the text is built from it there (lib/notifications.ts). */
export const NOTICE_KINDS = [
  'invited',
  'promoted',
  'changed',
  'cancelled',
  'removed',
  'resultReported',
  'resultConfirmed',
  'resultDisputed',
] as const

/**
 * One line on a person's `/notifications` page, written by `notify` (lib/notify.ts) at the same
 * moment as the email it would send. Read and marked read through /api/v1 only, so Payload's own
 * REST route is admin-only. `game` empties when the game is deleted; `gameTitle` keeps its name.
 */
export const Notifications: CollectionConfig = {
  slug: 'notifications',
  access: {
    read: isAdmin,
    create: isAdmin,
    update: isAdmin,
    delete: isAdmin,
  },
  admin: {
    defaultColumns: ['user', 'kind', 'gameTitle', 'readAt', 'createdAt'],
    description: 'In-app notices. Written by the site when something happens to a game a person is in.',
  },
  indexes: [{ fields: ['user', 'readAt'] }],
  fields: [
    { name: 'user', type: 'relationship', relationTo: 'users', required: true, index: true },
    { name: 'kind', type: 'select', required: true, options: NOTICE_KINDS.map((value) => ({ label: value, value })) },
    { name: 'game', type: 'relationship', relationTo: 'games' },
    { name: 'gameTitle', type: 'text', required: true },
    { name: 'readAt', type: 'date' },
  ],
}
