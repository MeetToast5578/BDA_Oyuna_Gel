import { APIError, type CollectionConfig, type FieldAccess } from 'payload'
import { jwtVerify } from 'jose'

import { isAdmin, isAdminOrSelf } from './access'

const MIN_PASSWORD_LENGTH = 8

const adminOnlyField: FieldAccess = ({ req }) => (req.user as { role?: string } | undefined)?.role === 'admin'

export const Users: CollectionConfig = {
  slug: 'users',
  access: {
    admin: ({ req }) => (req.user as { role?: string } | undefined)?.role === 'admin',
    // Google is the only way to sign up: the OAuth callback creates the account with
    // `overrideAccess`, so nothing needs a public create route.
    create: isAdmin,
    // Accounts hold emails and phone numbers: users only see their own.
    read: isAdminOrSelf,
    // The site edits profiles through /api/v1/me (validated, `overrideAccess`). Letting users write
    // their own row here let them set their email and password, then catch that address's first
    // Google sign-in, and skip the phone checks.
    update: isAdmin,
    delete: isAdmin,
  },
  admin: {
    useAsTitle: 'email',
  },
  hooks: {
    beforeOperation: [
      ({ args, operation }) => {
        if (operation === 'create' || operation === 'update' || operation === 'resetPassword') {
          const password = (args as { data?: { password?: unknown } }).data?.password
          if (typeof password === 'string' && password.length < MIN_PASSWORD_LENGTH) {
            throw new APIError(`Şifrə minimum ${MIN_PASSWORD_LENGTH} simvol olmalıdır.`, 400, undefined, true)
          }
        }
        return args
      },
    ],
  },
  auth: {
    // Payload's defaults, spelled out: 5 wrong passwords lock the account for 10 minutes.
    maxLoginAttempts: 5,
    lockTime: 10 * 60 * 1000,
    strategies: [
      {
        name: 'google',
        authenticate: async ({ headers, payload }) => {
          const cookieHeader = headers.get('cookie')
          const token = cookieHeader
            ?.split(';')
            .map((cookie) => cookie.trim())
            .find((cookie) => cookie.startsWith('google_session='))
            ?.split('=')[1]

          if (!token || !process.env.PAYLOAD_SECRET) {
            return { user: null }
          }

          try {
            const { payload: claims } = await jwtVerify(
              decodeURIComponent(token),
              new TextEncoder().encode(process.env.PAYLOAD_SECRET),
            )
            const result = await payload.find({
              collection: 'users',
              where: {
                googleId: {
                  equals: claims.sub,
                },
              },
              limit: 1,
            })

            const user = result.docs[0]
            return {
              user: user ? { ...user, collection: 'users' } : null,
            }
          } catch {
            return { user: null }
          }
        },
      },
    ],
  },
  fields: [
    {
      name: 'phoneNumber',
      type: 'text',
      unique: true,
    },
    {
      name: 'role',
      type: 'select',
      defaultValue: 'user',
      options: [
        { label: 'User', value: 'user' },
        { label: 'Admin', value: 'admin' },
      ],
      access: {
        create: adminOnlyField,
        update: adminOnlyField,
      },
    },
    {
      name: 'fullName',
      type: 'text',
      required: true,
    },
    {
      // "E-poçt bildirişləri" on the profile: emails about games this user joined (lib/notify.ts).
      name: 'emailNotifications',
      type: 'checkbox',
      defaultValue: true,
    },
    {
      name: 'profilePicture',
      type: 'upload',
      relationTo: 'media',
    },
    {
      // Google profile picture, set at Google sign-in. Admin-only so users can't point it at
      // arbitrary hosts (next.config.ts only allows Google's image host).
      name: 'avatarUrl',
      type: 'text',
      access: {
        create: adminOnlyField,
        update: adminOnlyField,
      },
      admin: {
        readOnly: true,
      },
    },
    {
      name: 'googleId',
      type: 'text',
      unique: true,
      access: {
        create: adminOnlyField,
        update: adminOnlyField,
      },
      admin: {
        hidden: true,
      },
    },
  ]
}
