import type { CollectionConfig } from 'payload'

import { isAdmin } from './access'

// ponytail: unused by the app — nothing reads `teams`, and the Games fields that point at it
// (homeTeam/awayTeam/homeScore/awayScore) are written only by scripts/seed.ts. Kept deliberately in
// case league play lands later; delete this collection and those four fields to reclaim the tables.
export const Teams: CollectionConfig = {
  slug: 'teams',
  // Without rules Payload lets any signed-in user edit or delete any team. Clubs will be written
  // through /api/v1 with `overrideAccess` (docs/teams-and-stats-plan.md, Phase 5), like games.
  access: {
    read: () => true,
    create: isAdmin,
    update: isAdmin,
    delete: isAdmin,
  },
  admin: {
    useAsTitle: 'name',
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
    },
    {
      name: 'shortName',
      type: 'text',
    },
    {
      name: 'sport',
      type: 'select',
      required: true,
      options: [
        { label: 'Football', value: 'football' },
        { label: 'Basketball', value: 'basketball' },
        { label: 'Tennis', value: 'tennis' },
      ],
    },
    {
      name: 'members',
      type: 'relationship',
      relationTo: 'users',
      hasMany: true,
    },
  ],
}