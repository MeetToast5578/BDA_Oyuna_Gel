import Link from 'next/link'

import styles from './HowItWorks.module.css'

const STEPS = [
  { title: 'Oyun tap', text: 'Futbol, tennis və basketbol oyunlarını gün, səviyyə və meydançaya görə süz.' },
  { title: 'Yerini tut', text: 'Bir kliklə qoşul. Təşkilatçının nömrəsi o an açılır.' },
  { title: 'Oyna, nəticəni yaz', text: 'Hesab təsdiqlənəndən sonra profilində və reytinqdə görünür.' },
]

/** "Necə işləyir": the three steps for someone who has never used the site. Numbered, because they are a sequence. */
export function HowItWorks() {
  return (
    <section className={`container ${styles.section}`} aria-labelledby="how-title">
      <h2 id="how-title" className={styles.title}>
        Necə işləyir
      </h2>
      <ol className={styles.steps}>
        {STEPS.map((step, index) => (
          <li key={step.title} className={styles.step}>
            <span className={styles.number} aria-hidden="true">
              {index + 1}
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
