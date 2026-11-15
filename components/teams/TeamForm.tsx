'use client'

import { useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'

import { postJson } from '@/lib/api-client'
import { TEAM_NAME_MAX, TEAM_NAME_MIN } from '@/lib/team-logic'
import choices from '@/components/create/GameForm.module.css'
import { buttonClass } from '@/components/ui/button'
import form from '@/components/ui/form.module.css'
import { SPORT_EMOJI, SPORT_LABELS, SPORT_ORDER } from '@/components/games/sports'

/** "Komanda yarat": a name and the one sport the club plays. The creator becomes its captain. */
export function TeamForm({ initialSport }: { initialSport?: string }) {
  const router = useRouter()
  const [name, setName] = useState('')
  const [sport, setSport] = useState(initialSport ?? 'football')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    const trimmed = name.trim().replace(/\s+/g, ' ')
    if (trimmed.length < TEAM_NAME_MIN || trimmed.length > TEAM_NAME_MAX) {
      return setError(`Komanda adı ${TEAM_NAME_MIN} ilə ${TEAM_NAME_MAX} simvol arasında olmalıdır.`)
    }
    setBusy(true)
    setError(null)
    try {
      const { id } = await postJson<{ id: string }>('/api/v1/teams', { name: trimmed, sport })
      router.push(`/teams/${id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Komandanı yaratmaq mümkün olmadı.')
      setBusy(false)
    }
  }

  return (
    <form className={choices.form} onSubmit={submit} noValidate>
      <label className={form.field}>
        <span className={form.labelSmall}>Komandanın adı</span>
        <input
          className={form.input}
          value={name}
          maxLength={TEAM_NAME_MAX}
          autoComplete="off"
          onChange={(event) => setName(event.target.value)}
        />
      </label>

      <fieldset className={form.field}>
        <legend className={form.labelSmall} style={{ marginBottom: 8 }}>
          İdman növü
        </legend>
        <div className={choices.choices}>
          {SPORT_ORDER.map((value) => (
            <label key={value} className={`${choices.choice} ${choices.sportChoice}`}>
              <input type="radio" name="sport" value={value} checked={sport === value} onChange={() => setSport(value)} />
              <span className={choices.emoji} aria-hidden="true">
                {SPORT_EMOJI[value]}
              </span>
              <span className={choices.choiceLabel}>{SPORT_LABELS[value]}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {error && (
        <p className={form.alert} role="alert">
          {error}
        </p>
      )}
      <button type="submit" className={buttonClass('primary', 'lg', { block: true })} disabled={busy}>
        Komanda yarat
      </button>
    </form>
  )
}
