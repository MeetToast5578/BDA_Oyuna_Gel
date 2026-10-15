import type { Access, FieldAccess } from 'payload'

type RoleUser = { id: number | string; role?: string } | null | undefined

export const isAdmin: Access = ({ req }) => (req.user as RoleUser)?.role === 'admin'

export const isAdminField: FieldAccess = ({ req }) => (req.user as RoleUser)?.role === 'admin'

/** Admins can touch every account; other signed-in users only their own. */
export const isAdminOrSelf: Access = ({ req }) => {
  const user = req.user as RoleUser
  if (!user) return false
  if (user.role === 'admin') return true
  return { id: { equals: user.id } }
}

/**
 * Participation rows say who is playing where, so they are not public: a user reads their own,
 * admins read all. Everything the app itself needs (avatar stacks, counts) runs with
 * `overrideAccess`, so this only closes the REST route that let anyone enumerate a person's games.
 */
export const isAdminOrParticipant: Access = ({ req }) => {
  const user = req.user as RoleUser
  if (!user) return false
  if (user.role === 'admin') return true
  return { user: { equals: user.id } }
}
