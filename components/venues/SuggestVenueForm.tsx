'use client'

import Link from 'next/link'
import { useState, type FormEvent } from 'react'

import choices from '@/components/create/GameForm.module.css'
import { SPORT_EMOJI, SPORT_LABELS, SPORT_ORDER } from '@/components/games/sports'
import { buttonClass } from '@/components/ui/button'
import form from '@/components/ui/form.module.css'
import { postJson } from '@/lib/api-client'

/** "Meydança təklif et": what an admin needs to find the place and add it. */
export function SuggestVenueForm() {
  const [name, setName] = useState('')
  const [district, setDistrict] = useState('')
  const [address, setAddress] = useState('')
  const [sports, setSports] = useState<string[]>([])
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (name.trim().length < 2 || sports.length === 0) return setError('Meydançanın adını yazın və ən azı bir idman növü seçin.')
    setBusy(true)
    setError(null)
    try {
      await postJson('/api/v1/venue-suggestions', { name, district, address, sports, note })
      setSent(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Təklifi göndərmək mümkün olmadı.')
    } finally {
      setBusy(false)
    }
  }

  if (sent) {
    return (
      <div role="status" className={choices.form}>
        <p className={form.hint} style={{ fontSize: 16 }}>
          Təşəkkürlər! Təklifinizi aldıq. Yoxlayandan sonra meydança saytda görünəcək.
        </p>
        <Link href="/venues" className={buttonClass('outlinePrimary', 'lg')}>
          Meydançalara qayıt
        </Link>
      </div>
    )
  }

  return (
    <form className={choices.form} onSubmit={submit} noValidate>
      <label className={form.field}>
        <span className={form.labelSmall}>Meydançanın adı</span>
        <input className={form.input} value={name} maxLength={80} autoComplete="off" onChange={(event) => setName(event.target.value)} />
      </label>
      <div className={form.row}>
        <label className={form.field}>
          <span className={form.labelSmall}>Rayon (istəyə bağlı)</span>
          <input className={form.input} value={district} maxLength={60} placeholder="məs. Nəsimi" onChange={(event) => setDistrict(event.target.value)} />
        </label>
        <label className={form.field}>
          <span className={form.labelSmall}>Ünvan (istəyə bağlı)</span>
          <input className={form.input} value={address} maxLength={160} placeholder="Küçə, nömrə" onChange={(event) => setAddress(event.target.value)} />
        </label>
      </div>
      <fieldset className={form.field}>
        <legend className={form.labelSmall} style={{ marginBottom: 8 }}>
          Hansı idman növləri oynanır?
        </legend>
        <div className={choices.choices}>
          {SPORT_ORDER.map((value) => (
            <label key={value} className={`${choices.choice} ${choices.sportChoice}`}>
              <input
                type="checkbox"
                value={value}
                checked={sports.includes(value)}
                onChange={(event) => setSports((current) => (event.target.checked ? [...current, value] : current.filter((sport) => sport !== value)))}
              />
              <span className={choices.emoji} aria-hidden="true">
                {SPORT_EMOJI[value]}
              </span>
              <span className={choices.choiceLabel}>{SPORT_LABELS[value]}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <label className={form.field}>
        <span className={form.labelSmall}>Qeyd (istəyə bağlı)</span>
        <textarea
          className={form.input}
          rows={3}
          value={note}
          maxLength={500}
          placeholder="Xəritə linki, iş saatları, qiymət…"
          onChange={(event) => setNote(event.target.value)}
        />
      </label>
      {error && (
        <p className={form.alert} role="alert">
          {error}
        </p>
      )}
      <button type="submit" className={buttonClass('primary', 'lg', { block: true })} disabled={busy}>
        {busy ? 'Göndərilir…' : 'Təklifi göndər'}
      </button>
    </form>
  )
}
