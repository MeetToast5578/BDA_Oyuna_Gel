import Link from 'next/link'

import { Icon, type IconName } from '@/components/ui/Icon'
import styles from './HowItWorks.module.css'

// Each step borrows a sport's colour (data-sport), so the row reads as the three sports together.
const STEPS: { title: string; text: string; icon: IconName; sport: string }[] = [
  { icon: 'search', sport: 'football', title: 'Oyun tap', text: 'Futbol, tennis və basketbol oyunlarını gün, səviyyə və meydançaya görə süz.' },
  { icon: 'userPlus', sport: 'basketball', title: 'Yerini tut', text: 'Bir kliklə qoşul. Təşkilatçının nömrəsi o an açılır.' },
  { icon: 'trophy', sport: 'tennis', title: 'Oyna, nəticəni yaz', text: 'Hesab təsdiqlənəndən sonra profilində və reytinqdə görünür.' },
]

/** "Necə işləyir": the three steps for someone who has never used the site. Numbered, because they are a sequence. */
export function HowItWorks() {
  return (
    <section className={`container scroll-reveal ${styles.section}`} aria-labelledby="how-title">
      <h2 id="how-title" className={styles.title}>
        Necə işləyir
      </h2>
      <ol className={styles.steps}>
        {STEPS.map((step, index) => (
          <li key={step.title} className={styles.step} data-sport={step.sport}>
            <span className={styles.tile} aria-hidden="true">
              <Icon name={step.icon} size={24} />
              <span className={styles.number}>{index + 1}</span>
            </span>
            <h3 className={styles.stepTitle}>{step.title}</h3>
            <p className={styles.text}>{step.text}</p>
          </li>
        ))}
      </ol>
      <p className={styles.more}>
        Komandan var? <Link href="/teams">Komanda yarat</Link> və <Link href="/leaderboard">reytinqə</Link> bax.
      </p>
    </section>
  )
}
