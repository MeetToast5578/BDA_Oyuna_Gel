import type { CollectionConfig } from 'payload'

import { isAdmin } from './access'

/**
 * A host's invitation of a named player to one side of a game. It holds no spot (the spot is taken
 * when the person joins) and carries only the side to pre-pick. Written through /api/v1 with
 * `overrideAccess` (lib/invites.ts), like games, so Payload's own REST route is admin-only.
 * Plan: docs/game-setup-teams-and-players-plan.md, Phase 10.
 */
export const GameInvites: CollectionConfig = {
  slug: 'game-invites',
  access: {
    read: isAdmin,
    create: isAdmin,
    update: isAdmin,
    delete: isAdmin,
  },
  admin: {
    defaultColumns: ['game', 'user', 'side', 'status'],
    description: 'Invitations to a game. Created by the invite endpoints; the invited player answers by joining or declining.',
  },
  // Also the conflict target for "already invited": a player is invited to a game at most once.
  indexes: [{ fields: ['game', 'user'], unique: true }],
  fields: [
    { name: 'game', type: 'relationship', relationTo: 'games', required: true, index: true },
    { name: 'user', type: 'relationship', relationTo: 'users', required: true, index: true },
    { name: 'invitedBy', type: 'relationship', relationTo: 'users' },
    {
      name: 'side',
      type: 'select',
      required: true,
      options: [
        { label: 'Home', value: 'home' },
        { label: 'Away', value: 'away' },
      ],
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'pending',
      options: [
        { label: 'Pending', value: 'pending' },
        { label: 'Accepted', value: 'accepted' },
        { label: 'Declined', value: 'declined' },
      ],
    },
  ],
}
