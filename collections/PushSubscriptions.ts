import type { CollectionConfig } from 'payload'

import { isAdmin } from './access'

/**
 * A browser or phone that asked for notifications ("Telefona bildiriş göndər"), as the Push API hands
 * it over. `notify` (lib/notify.ts) sends each notice to every one of a person's devices; one the
 * push service says is gone is deleted. Written through /api/v1/me/push only.
 */
export const PushSubscriptions: CollectionConfig = {
  slug: 'push-subscriptions',
  access: {
    read: isAdmin,
    create: isAdmin,
    update: isAdmin,
    delete: isAdmin,
  },
  admin: {
    defaultColumns: ['user', 'createdAt'],
    description: 'Devices that turned on phone notifications. Created from the profile; removed when the push service drops them.',
  },
  fields: [
    { name: 'user', type: 'relationship', relationTo: 'users', required: true, index: true },
    { name: 'endpoint', type: 'text', required: true, unique: true },
    { name: 'p256dh', type: 'text', required: true },
    { name: 'auth', type: 'text', required: true },
  ],
}
