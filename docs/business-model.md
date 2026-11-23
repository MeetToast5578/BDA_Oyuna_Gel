# Business model: how OyunaGəl makes money

OyunaGəl helps people in Baku find and join open football, tennis and basketball games. Today it earns
nothing: there are no prices, payments or venue accounts in the code. This plan turns the traffic
into income in the order that needs the least code, legal setup and risk.

Every money figure below is an **assumption to test**, not a forecast. Replace it with what venues
and sponsors actually agree to pay.

## Who pays, and why

Players are the growth engine and stay free: joining and creating games never goes behind a
paywall. The money comes from businesses that want those players:

| Who | What they want | What we sell |
|---|---|---|
| Venues (pitches, courts, halls) | Their empty evening and weekday slots filled | Partner listing + monthly report |
| Brands (sports shops, drinks, gyms, clinics) | Reach active amateur players in Baku | Sponsor slots on the leaderboard and sport tabs |
| Teams and organisers | Organised, refereed competition with a table | Tournaments and leagues with an entry fee |
| Organisers who collect money per player (phase 2) | Collect fees without chasing people | Online payment with a small platform fee |

## Step 0: before charging anyone (month 0–1)

1. **Register the business.** Register as a sole proprietor (fərdi sahibkar) to get a VÖEN, via
   e-taxes.gov.az or an ASAN service centre, and open a business bank account. Ask an accountant
   which tax regime fits a small online service; the turnover thresholds change, so this doc does
   not quote rates. Venues and sponsors need an invoice from a registered business, and every
   payment provider requires one.
2. **Turn on measurement.** Supply the GA4 measurement ID (the integration is already built and
   consent-first, see `docs/analytics.md`). Without numbers there is nothing to show a venue.
3. **Count what venues care about.** Per venue, per month:
   - games created there and players who joined them (already in the database: Games → `arena`,
     participants);
   - repeat players (joined two or more games there);
   - page views of `/venues/:id` and clicks on "Xəritədə aç" (`venue_map_opened`, added for this
     plan).
4. **Make a one-page venue pitch** with those numbers: "Last month 64 players played 11 games at
   your pitch through OyunaGəl." Real numbers beat any slide.
5. **Write down the bar for charging.** Owner to fill in: charge a venue only once it gets at least
   ___ games a month through the site.

## Revenue streams, in priority order

### 1. Partner venues ("Tərəfdaş meydança") — the main stream

**Offer.**
- "Tərəfdaş" badge and a phone / WhatsApp booking button on the venue page.
- Price per hour and opening hours shown on the venue page.
- Listed first in `/venues` and in the venue picker on "Oyun yarat".
- A monthly report: views, map clicks, games and players at the venue.

**Price (to test).** 50–150 ₼ a month, invoiced monthly. Start in the middle (about 80 ₼) and
adjust by venue size.

**Pilot.** The first 5–10 venues get 2–3 months free, in exchange for feedback and a quote we can
use. A free start is the local norm: tutto.az offers 0% commission for its first two months.

**Pitch.** "We bring players to your empty slots." Venues already pay for Instagram ads; this is a
cheaper, measurable alternative.

**Risk.** Paid placement must stay honest: partner venues are labelled "Tərəfdaş", and games are
never hidden because their venue is not a partner.

### 2. Sponsors

**Offer.** A sponsor line and logo on "Ayın ən yaxşıları" (the monthly leaderboard on the home
page) and on one sport's tab, such as "Futbol — dəstəkləyən: X". Good fits are sports shops, sports
drinks, gyms and physiotherapy clinics.

**Price (to test).** 300–500 ₼ a month per slot, invoiced monthly, with a 3-month minimum.

**Extra.** Sponsors can fund prizes for the month's top players, which gives the leaderboard more
pull.

### 3. Tournaments and leagues

**How it works.** Run a weekend tournament or a 6-week league. Teams pay an entry fee; we pay the
venue and the prizes and keep the margin. The site already has clubs, sides, score reporting with
confirmation, and standings, so the first ones run with no new code.

**Example (assumption).** 8 football teams × 120 ₼ = 960 ₼. Venue 6 hours × 50 ₼ = 300 ₼.
Prizes 300 ₼. Margin about 360 ₼, more with a sponsor.

**Collecting fees.** Bank transfer to the business account before the draw.

### 4. Phase 2: online payments (month 6+, only if the numbers justify it)

Many pickup organisers already collect 5–10 ₼ per player in cash. Once a meaningful share of games
on the site have a per-player fee, we can collect it online:

- A player pays for their spot when joining; we keep a platform fee (5–8% to test) and pay the
  organiser out.
- Promoted games: an organiser pays a few manat to pin a game in the home carousel for 48 hours,
  always labelled "Önə çıxan". Amounts this small only make sense with online payment.

**What this needs:** the registered business, a contract with an Azerbaijani payment provider
(candidates to compare: Payriff, Epoint, a bank's e-commerce acquiring), refund and cancellation
rules, updated terms and privacy pages, and real engineering time (payments, refunds, payouts,
disputes). Do not start it before streams 1–3 are earning.

## Not doing

- **Display ads.** Traffic is too small to pay meaningfully, ads would undo the redesign, and the
  analytics setup deliberately denies ad storage and personalisation.
- **Charging players for core features.** Joining and creating games stays free.
- **Selling player data.** Never. The privacy page and the consent design rule it out.

## Milestones

| When | Goal |
|---|---|
| Month 0–1 | Business registered, GA4 live, venue click tracking live, venue pitch ready |
| Month 1–3 | Free pilot with 5 venues; pitch 1 sponsor; collect quotes |
| Month 3 | Pilot venues start paying; first tournament |
| Month 6 | Review: if many games charge per player, plan online payments |

**An example month once streams 1–3 run (assumptions):** 10 partner venues × 80 ₼ = 800 ₼,
1 sponsor = 400 ₼, 1 tournament margin ≈ 350 ₼. Total about 1,550 ₼ a month.

## What to watch each month

- Games created and players joined, per sport and per venue.
- Share of games at partner venues, and partner venues that renew.
- Sponsor renewals.
- Players who come back the next month (retention). If this drops, fix the product before selling
  more.

## Code needed later (listed in `tasks.md`, not built yet)

Build these only after the first venue or sponsor says yes, so the code matches a real deal:

1. Venue fields on `collections/Arena.ts`: `partner`, `phone`, `bookingUrl`, `priceNote`, `hours`
   (admins only). Partner venues sort first in `/venues` and the venue picker, with a "Tərəfdaş"
   badge and a call / WhatsApp button.
2. A monthly per-venue report: a script, like `scripts/storage.ts`, that counts games, players and
   repeat players per venue from the database.
3. A sponsor slot on `MonthTop`, edited in the admin panel (a Payload global).
4. Phase 2 only: `promotedUntil` on Games, lifting the game in `rankFeatured`
   (`lib/game-backend.ts`) with an "Önə çıxan" label; then online payments.
