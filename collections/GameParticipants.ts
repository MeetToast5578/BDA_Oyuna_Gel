import type { CollectionConfig } from 'payload'

import { invalidateGamesCache } from '../lib/cache-tags'
import { isAdmin, isAdminField, isAdminOrParticipant } from './access'

/** One row per player who joined a game. Written by POST /api/v1/games/[id]/join (lib/join-game.ts). */
export const GameParticipants: CollectionConfig = {
  slug: 'game-participants',
  access: {
    read: isAdminOrParticipant,
    create: isAdmin,
    update: isAdmin,
    delete: isAdmin,
  },
  admin: {
    defaultColumns: ['game', 'user', 'createdAt'],
    description: 'Players who joined a game. Created by the join endpoint, which also decrements the game\'s available spots.',
  },
  // Also the ON CONFLICT target in lib/join-game.ts: a user can hold at most one spot per game.
  indexes: [{ fields: ['game', 'user'], unique: true }],
  fields: [
    {
      name: 'game',
      type: 'relationship',
      relationTo: 'games',
      required: true,
      index: true,
    },
    {
      name: 'user',
      type: 'relationship',
      relationTo: 'users',
      required: true,
    },
    {
      name: 'name',
      type: 'text',
      admin: {
        description:
          "Name the player gave in step 1 of the join form. The site shows the account's name, and this one only once the account is gone.",
      },
    },
    {
      name: 'side',
      type: 'select',
      required: true,
      options: [
        { label: 'Home', value: 'home' },
        { label: 'Away', value: 'away' },
      ],
      admin: {
        description: 'Which half of the game the player is on. Each side holds half of maxPlayers (lib/team-logic.ts).',
      },
    },
    {
      name: 'phone',
      type: 'text',
      access: {
        read: isAdminField,
      },
      admin: {
        description: 'Number the player gave in the join form. Visible to admins only.',
      },
    },
  ],
  hooks: {
    afterChange: [({ doc }) => {
      invalidateGamesCache()
      return doc
    }],
    afterDelete: [({ doc }) => {
      invalidateGamesCache()
      return doc
    }],
  },
}
