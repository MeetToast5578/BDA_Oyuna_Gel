import { compareStandings, summarize } from '@/lib/team-logic'

/** Authored fictional personas, never a filter or gender inference over real accounts. */
export const DEMO_NAMES = {
  football: [
    'Elvin Məmmədov', 'Rəşad Əliyev', 'Nicat Hüseynov', 'Orxan Quliyev', 'Kamran Həsənov', 'Tural İsmayılov',
    'Fərid Rəhimov', 'Ramil Abbasov', 'Emin Kərimov', 'Anar Mustafayev', 'Vüsal Nəbiyev', 'Ceyhun Vəliyev',
    'Murad Səfərov', 'Samir Bayramov', 'Elçin Cəfərov', 'Rüfət Axundov', 'Ayxan Salmanov', 'Ülvi Orucov',
    'Zaur Tağıyev', 'Nurlan Şirinov', 'Xəyal Qasımov', 'Səbuhi Novruzov', 'Fuad Zeynalov', 'İlkin Babayev',
  ],
  basketball: [
    'Toğrul Əliyev', 'Kənan Məmmədov', 'Mahir Hüseynov', 'Şahin Quliyev', 'Cavid Həsənov', 'Rauf İsmayılov',
    'Elnur Rəhimov', 'Vaqif Abbasov', 'Əli Kərimov', 'Hüseyn Mustafayev', 'Tofiq Nəbiyev', 'Yusif Vəliyev',
    'Ramin Səfərov', 'Vüqar Bayramov', 'Eldar Cəfərov', 'Ruslan Axundov',
  ],
  tennis: [
    'Aysel Əliyeva', 'Nərmin Məmmədova', 'Leyla Hüseynova', 'Günel Quliyeva',
    'Səid Həsənov', 'Cəlal İsmayılov', 'İlqar Rəhimov', 'Sənan Abbasov',
  ],
} as const

export type DemoSport = keyof typeof DEMO_NAMES

/** Seed accounts get stable, distinct identities even when display names change later. */
export function demoPeople() {
  return (Object.keys(DEMO_NAMES) as DemoSport[]).flatMap((sport) => DEMO_NAMES[sport].map((fullName, index) => ({
    sport, fullName, email: `${sport}.${index + 1}@seed.oyunagel.az`,
  })))
}

/** Explicit sample mode only: never combined with database standings or linked to a real profile. */
export function demoStandings(sport: string) {
  if (!Object.hasOwn(DEMO_NAMES, sport)) return []
  return DEMO_NAMES[sport as DemoSport].slice(0, 6).map((name, index) => {
    const wins = 6 - index
    const draws = sport === 'tennis' ? 0 : index % 2
    const record = summarize(Array.from({ length: 8 }, (_, game) => {
      const outcome = game < wins ? 'win' : game < wins + draws ? 'draw' : 'loss'
      const high = sport === 'basketball' ? 78 : sport === 'tennis' ? 2 : 3
      const low = sport === 'basketball' ? 65 : sport === 'tennis' ? 0 : 1
      return { side: 'home' as const, homeScore: outcome === 'loss' ? low : high, awayScore: outcome === 'win' ? low : high,
        scheduledAt: new Date(Date.UTC(2000, 0, game + 1)).toISOString() }
    }))
    return { id: `sample:${sport}:${index}`, name, record }
  }).sort((a, b) => compareStandings(a.record, b.record) || a.name.localeCompare(b.name, 'az'))
}
