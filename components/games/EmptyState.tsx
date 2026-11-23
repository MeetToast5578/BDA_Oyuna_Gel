import Image from 'next/image'

import styles from './GamesGrid.module.css'

export function EmptyState({
  title,
  text,
  action,
  headingLevel = 'h3',
}: {
  title: string
  text: string
  action?: React.ReactNode
  headingLevel?: 'h1' | 'h2' | 'h3'
}) {
  const Heading = headingLevel
  return (
    <div className={styles.empty}>
      {/*
        Decorative: the heading below carries the meaning, so the alt text is empty.
        width/height are the file's own 780x1170, not the size it renders at — they are what next/image
        uses to reserve the right shape while it loads, and the stylesheet caps the display width.
      */}
      <Image
        src="/images/empty-sports.png"
        alt=""
        width={780}
        height={1170}
        sizes="320px"
        className={styles.emptyImage}
      />
      <Heading className={styles.emptyTitle}>{title}</Heading>
      <p className={styles.emptyText}>{text}</p>
      {action}
    </div>
  )
}
