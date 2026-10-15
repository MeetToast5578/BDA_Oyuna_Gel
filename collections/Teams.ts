import type { CollectionConfig } from 'payload'

import { isAdmin, isAdminField } from './access'

/** Clubs: a named team of members that can stand on a side of a game (docs/teams-and-stats-plan.md). */
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
    {
      name: 'captain',
      type: 'relationship',
      relationTo: 'users',
      admin: {
        description: 'Empty once the last member leaves; the club stays so its old games keep their record.',
      },
    },
    {
      name: 'inviteCode',
      type: 'text',
      unique: true,
      access: {
        read: isAdminField,
      },
      admin: {
        description: 'Secret code in the invite link. Shown to the captain by the club endpoint, and here to admins only.',
      },
    },
  ],
}