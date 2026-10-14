import type { CollectionConfig } from 'payload'

import { invalidateGamesCache } from '../lib/cache-tags'
import { isAdmin } from './access'

export const Games: CollectionConfig = {
  slug: 'games',
  // Every write the site makes goes through /api/v1, which validates it and then writes with
  // `overrideAccess`. Payload's own REST route (/api/games) is for the admin panel only: open to
  // hosts, it let them set `status`, `availablePlayers` or a past `scheduledAt` past every rule.
  access: {
    read: () => true,
    create: isAdmin,
    update: isAdmin,
    delete: isAdmin,
  },
  defaultPopulate: {
    host: true,
  },
  admin: {
    useAsTitle: 'title',
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
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
      name: 'coverImage',
      type: 'upload',
      relationTo: 'media',
      admin: {
        description: 'Cover shown on game cards, served as thumbnail and full-size WebP.',
      },
    },
    {
      name: 'image',
      type: 'text',
      admin: {
        description: 'Fallback public image path, used when no cover image is uploaded. Without either, the sport\'s default image is used.',
      },
    },
    {
      name: 'arena',
      type: 'relationship',
      relationTo: 'arenas',
      required: true,
    },
    {
      name: 'level',
      type: 'select',
      required: true,
      options: [
        { label: 'Beginner', value: 'beginner' },
        { label: 'Medium', value: 'medium' },
        { label: 'High', value: 'high' },
      ],
    },
    {
      // Every new game gets one (createGame, and the beforeValidate hook below). It is only ever empty
      // on a game that already happened when its host deleted their account: that game stays in the
      // other players' history (deleteMyAccount).
      name: 'host',
      type: 'relationship',
      relationTo: 'users',
      admin: {
        readOnly: true,
      },
    },
    {
      name: 'contactPhone',
      type: 'text',
      admin: {
        description: 'Host\'s contact number. The API only shows it to players who joined and to the host.',
      },
      access: {
        read: ({ req, doc }) => {
          const user = req.user as { id: number | string; role?: string } | null
          if (!user) return false
          if (user.role === 'admin') return true
          const host = doc?.host as { id?: number | string } | number | string | undefined
          return (typeof host === 'object' ? host?.id : host) === user.id
        },
      },
    },
    {
      name: 'homeTeam',
      type: 'relationship',
      relationTo: 'teams',
    },
    {
      name: 'awayTeam',
      type: 'relationship',
      relationTo: 'teams',
    },
    {
      name: 'scheduledAt',
      type: 'date',
      required: true,
    },
    {
      name: 'maxPlayers',
      type: 'number',
      min: 1,
      required: true,
    },
    {
      name: 'availablePlayers',
      type: 'number',
      min: 0,
      required: true,
    },
    {
      name: 'homeScore',
      type: 'number',
      defaultValue: 0,
    },
    {
      name: 'awayScore',
      type: 'number',
      defaultValue: 0,
    },
    {
      name: 'status',
      type: 'select',
      defaultValue: 'scheduled',
      options: [
        { label: 'Scheduled', value: 'scheduled' },
        { label: 'Live', value: 'live' },
        { label: 'Finished', value: 'finished' },
        { label: 'Cancelled', value: 'cancelled' },
      ],
    },
  ],
  hooks: {
    beforeValidate: [
      ({ data, operation, req }) => {
        if (operation === 'create' && data && req.user) {
          data.host = req.user.id

          if (data.availablePlayers === undefined && data.maxPlayers !== undefined) {
            data.availablePlayers = data.maxPlayers
          }
        }

        return data
      },
    ],
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
