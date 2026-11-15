import { APIError, type Access, type CollectionConfig } from 'payload'

import { isRateLimited } from '../lib/rate-limit'
import { IMAGE_MIME_TYPES } from '../lib/uploads'

type RoleUser = { id: number | string; role?: string } | null | undefined

/**
 * Anyone signed in may upload (a profile picture), but only the uploader or an admin may change or
 * delete a file afterwards. Without this Payload's default lets every signed-in user overwrite or
 * delete any upload — venue photos, game covers, other people's pictures. Files uploaded before
 * `uploadedBy` existed have no owner, so only admins can touch them.
 */
const isAdminOrUploader: Access = ({ req }) => {
  const user = req.user as RoleUser
  if (!user) return false
  if (user.role === 'admin') return true
  return { uploadedBy: { equals: user.id } }
}

export const Media: CollectionConfig = {
  slug: 'media',
  access: {
    read: () => true,
    create: ({ req }) => Boolean(req.user),
    update: isAdminOrUploader,
    delete: isAdminOrUploader,
  },
  hooks: {
    beforeOperation: [
      // Each upload costs Blob storage, so a signed-in user can't fill it in a loop.
      async ({ operation, req, overrideAccess }) => {
        const user = req.user as RoleUser
        if (operation !== 'create' || overrideAccess || !user || user.role === 'admin') return
        if (await isRateLimited(req.payload, 'upload', { userId: user.id })) {
          throw new APIError('Çox şəkil yüklədiniz. Bir az sonra yenidən yoxlayın.', 429, undefined, true)
        }
      },
    ],
    beforeChange: [
      ({ data, operation, originalDoc, req }) => {
        const user = req.user as RoleUser
        // Set by the server, never taken from the request: nobody can upload in someone else's name
        // or pass a file on. Admins may reassign one in the admin panel.
        if (user?.role === 'admin') {
          if (operation === 'create' && data.uploadedBy == null) data.uploadedBy = user.id
          return data
        }
        if (operation === 'create') data.uploadedBy = user?.id ?? null
        else data.uploadedBy = originalDoc?.uploadedBy ?? null
        return data
      },
    ],
  },
  fields: [
    {
      name: 'alt',
      type: 'text',
      required: true,
    },
    {
      name: 'uploadedBy',
      type: 'relationship',
      relationTo: 'users',
      index: true,
      admin: {
        position: 'sidebar',
        description: 'Only this user (and admins) can change or delete the file.',
      },
    },
  ],
  upload: {
    mimeTypes: IMAGE_MIME_TYPES,
    adminThumbnail: 'thumbnail',
    // WebP renditions for game cards. next/image additionally serves AVIF to browsers that accept it
    // (images.formats in next.config.ts). Set MEDIA_BASE_URL to serve these through a CDN.
    imageSizes: [
      {
        name: 'thumbnail',
        width: 480,
        height: 270,
        position: 'centre',
        formatOptions: { format: 'webp', options: { quality: 80 } },
      },
      {
        name: 'full',
        width: 1600,
        withoutEnlargement: true,
        formatOptions: { format: 'webp', options: { quality: 82 } },
      },
    ],
  },
}
