import type { CollectionConfig } from 'payload'

import { invalidateGamesCache } from '../lib/cache-tags'
import { isAdmin } from './access'
import { CITY_OPTIONS, DEFAULT_CITY, isHttpsUrl, normalizePhone, parseCoordinates } from '../lib/game-backend'

export const Arena: CollectionConfig = {
  slug: 'arenas',
  access: {
    read: () => true,
    // Payload's default for the rest is "any signed-in user", which let anyone delete venues.
    create: isAdmin,
    update: isAdmin,
    delete: isAdmin,
  },
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'city', 'district', 'sportTypes'],
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
    },
    {
      name: 'location',
      type: 'text',
      required: true,
    },
    {
      name: 'city',
      type: 'select',
      required: true,
      defaultValue: DEFAULT_CITY,
      index: true,
      options: CITY_OPTIONS,
      admin: {
        description: 'Used by the city filter on the /api/v1 sports, games and venues endpoints.',
      },
    },
    {
      name: 'district',
      type: 'text',
      admin: {
        description: 'City district or neighborhood where the venue is located.',
      },
    },
    {
      name: 'address',
      type: 'text',
    },
    {
      name: 'coordinates',
      type: 'text',
      admin: {
        description: 'Latitude and longitude separated by a comma, for example 40.3755,49.8335.',
      },
      validate: (value: string | null | undefined) =>
        !value || parseCoordinates(value) !== null || 'Use "latitude,longitude", for example 40.3755,49.8335.',
    },
    {
      name: 'image',
      type: 'upload',
      relationTo: 'media',
      admin: {
        description: 'Photo of the venue. Games here use it as their cover unless they set one of their own.',
      },
    },
    {
      name: 'imagePath',
      type: 'text',
      admin: {
        description: 'Fallback public image path such as /images/arenas/inter-arena.png, used when no photo is uploaded.',
      },
    },
    {
      name: 'sportTypes',
      type: 'select',
      hasMany: true,
      options: [
        { label: 'Football', value: 'football' },
        { label: 'Basketball', value: 'basketball' },
        { label: 'Tennis', value: 'tennis' },
      ],
    },
    {
      name: 'description',
      type: 'textarea',
    },
    // Partner venues (docs/business-model.md): listed first, with a badge and direct contact buttons.
    {
      name: 'partner',
      type: 'checkbox',
      defaultValue: false,
      admin: {
        position: 'sidebar',
        description: 'Tərəfdaş: listed first on /venues and in the venue picker, with a badge and contact buttons.',
      },
    },
    {
      name: 'phone',
      type: 'text',
      admin: { description: 'Booking phone, e.g. +994501234567. Shows "Zəng et" and "WhatsApp" on the venue page.' },
      validate: (value: string | null | undefined) =>
        !value || normalizePhone(value) !== null || 'Use an Azerbaijani number, for example +994501234567.',
      // Stored as +994XXXXXXXXX; anything that isn't a number is left as typed so validation refuses it.
      hooks: { beforeChange: [({ value }) => (typeof value === 'string' && value.trim() ? (normalizePhone(value) ?? value) : null)] },
    },
    {
      name: 'bookingUrl',
      type: 'text',
      admin: { description: 'Online booking page (https://…). Shows "Bron et" on the venue page.' },
      validate: (value: string | null | undefined) => !value || isHttpsUrl(value) || 'Use a full https:// link.',
    },
    {
      name: 'priceNote',
      type: 'text',
      admin: { description: 'Price as shown to players, e.g. "40–60 ₼/saat".' },
    },
    {
      name: 'hours',
      type: 'text',
      admin: { description: 'Opening hours, e.g. "09:00–24:00".' },
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
