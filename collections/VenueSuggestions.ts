import type { CollectionConfig } from 'payload'

import { isAdmin } from './access'

/**
 * "Meydança təklif et": a venue a player would like on the site. An admin reads it here and, if it is
 * real, adds the venue under Arenas and sets the status. Sent through /api/v1/venue-suggestions only.
 */
export const VenueSuggestions: CollectionConfig = {
  slug: 'venue-suggestions',
  access: {
    read: isAdmin,
    create: isAdmin,
    update: isAdmin,
    delete: isAdmin,
  },
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'district', 'status', 'submittedBy', 'createdAt'],
    description: 'Venues players suggested. Add the real ones under Arenas, then mark them added or rejected.',
  },
  fields: [
    { name: 'name', type: 'text', required: true },
    { name: 'district', type: 'text' },
    { name: 'address', type: 'text' },
    {
      name: 'sports',
      type: 'select',
      hasMany: true,
      required: true,
      options: [
        { label: 'Futbol', value: 'football' },
        { label: 'Basketbol', value: 'basketball' },
        { label: 'Tennis', value: 'tennis' },
      ],
    },
    { name: 'note', type: 'textarea' },
    { name: 'submittedBy', type: 'relationship', relationTo: 'users', index: true },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'pending',
      options: [
        { label: 'Pending', value: 'pending' },
        { label: 'Added', value: 'added' },
        { label: 'Rejected', value: 'rejected' },
      ],
    },
  ],
}
