import type { CollectionConfig } from 'payload'

import { isAdmin } from './access'

export const JOIN_OUTCOMES = [
  'JOINED',
  'GAME_FULL',
  'GAME_NOT_JOINABLE',
  'GAME_NOT_FOUND',
  'ALREADY_JOINED',
  'SIDE_FULL',
  'NOT_A_MEMBER',
  'UNAUTHENTICATED',
  'INVALID_REQUEST',
  'ERROR',
  // Leaving is logged here too: a log that counted joins but not leaves would read as if everyone
  // who ever joined were still in the game.
  'LEFT',
  'NOT_JOINED',
  'HOST_CANNOT_LEAVE',
  'GAME_STARTED',
] as const

export type JoinOutcome = (typeof JOIN_OUTCOMES)[number]

/** Audit log of every join and leave request, successful or not. Append-only; written by those endpoints. */
export const JoinAttempts: CollectionConfig = {
  slug: 'join-attempts',
  access: {
    read: isAdmin,
    create: () => false,
    update: () => false,
    delete: isAdmin,
  },
  admin: {
    defaultColumns: ['createdAt', 'outcome', 'gameId', 'user'],
    description: 'Audit log of join requests. Read-only; written by the join endpoint.',
  },
  fields: [
    {
      name: 'outcome',
      type: 'select',
      required: true,
      options: JOIN_OUTCOMES.map((value) => ({ label: value, value })),
    },
    {
      name: 'gameId',
      type: 'number',
      admin: {
        description: 'Requested game ID. Stored as a number so attempts on missing games are logged too.',
      },
    },
    {
      name: 'user',
      type: 'relationship',
      relationTo: 'users',
    },
    {
      name: 'remainingSpots',
      type: 'number',
      admin: {
        description: 'Spots left after a successful join.',
      },
    },
    {
      name: 'ip',
      type: 'text',
    },
  ],
}
