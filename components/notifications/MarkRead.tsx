'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

import { postJson } from '@/lib/api-client'

/** Once the list has been seen, marks it read and refreshes, so the header's count clears. */
export function MarkRead() {
  const router = useRouter()
  useEffect(() => {
    postJson('/api/v1/me/notifications/read', {})
      .then(() => router.refresh())
      .catch(() => {})
  }, [router])
  return null
}
