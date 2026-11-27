import type { Metadata } from 'next'
import Link from 'next/link'

import { SOCIAL_LINKS } from '@/components/site/Footer'
import { InfoPage } from '@/components/site/InfoPage'

export const metadata: Metadata = { title: 'Əlaqə' }

export default function ContactPage() {
  return (
    <InfoPage title="Əlaqə" lead="Oyunla bağlı suallar üçün birbaşa hostla əlaqə saxla.">
      <p>
        Host-un telefon nömrəsi oyuna qoşulduqdan sonra oyun səhifəsində görünür. <Link href="/games">Açıq oyunlara bax</Link>{' '}
        və sənə uyğun oyunu seç.
      </p>
      <p>
        Yeni oyunlar və xəbərlər üçün bizi izlə:{' '}
        {SOCIAL_LINKS.map((link, index) => (
          <span key={link.href}>
            {index > 0 && ' və '}
            <a href={link.href} target="_blank" rel="noopener noreferrer">
              {link.label}
            </a>
          </span>
        ))}
        .
      </p>
    </InfoPage>
  )
}
