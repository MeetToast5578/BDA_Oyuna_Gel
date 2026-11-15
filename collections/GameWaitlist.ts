import type { CollectionConfig } from 'payload'

import { isAdmin } from './access'

/**
 * People waiting for a spot in a full game, in the order they signed up. When a spot comes back the
 * first person who can stand on a free side takes it (lib/waitlist.ts, `promoteWaiting`). Written
 * through /api/v1 with `overrideAccess`, so Payload's own REST route is admin-only.
 */
export const GameWaitlist: CollectionConfig = {
  slug: 'game-waitlist',
  access: {
    read: isAdmin,
    create: isAdmin,
    update: isAdmin,
    delete: isAdmin,
  },
  admin: {
    defaultColumns: ['game', 'user', 'createdAt'],
    description: 'Players waiting for a spot in a full game. Created by the waitlist endpoint; promoted when a spot frees up.',
  },
  indexes: [{ fields: ['game', 'user'], unique: true }],
  fields: [
    { name: 'game', type: 'relationship', relationTo: 'games', required: true, index: true },
    { name: 'user', type: 'relationship', relationTo: 'users', required: true, index: true },
    {
      name: 'name',
      type: 'text',
      required: true,
      admin: { description: 'Name given when signing up for the list; it becomes the participant row\'s name.' },
    },
    {
      name: 'phone',
      type: 'text',
      required: true,
      access: { read: ({ req }) => (req.user as { role?: string } | undefined)?.role === 'admin' },
      admin: { description: 'Number given when signing up for the list. Visible to admins only.' },
    },
  ],
}
