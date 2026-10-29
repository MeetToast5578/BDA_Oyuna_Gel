# Plan: page fixes and new features (29 October 2026)

> **Status (29 October):** built on `Branch-1` except A5 (Əlaqə, waits on D19) and A6 (wording, waits
> on D20), and C2 (automatic weekly games, not started per D21's default). Defaults were used for D22–D25.
> Commits: stage 1 `877ab92`, 2 `6a18990`, 3 `974d5ec`, 4 `428f869`, 5 `e767164`, 6 (this commit).
> Not built from the plan: the upcoming-game count in the map popup.

How to build everything from the page review of 29 October. Each item says what the user sees, what
changes in the data, the code it touches, its tests, and its risks. Built on `Branch-1` under the
rules in `docs/handoff.md` §1: a test that fails on the old code, the full check before every push,
new Azerbaijani strings listed in the commit, nothing touching the live database.

**Effort:** S = under an hour · M = about a session · L = several sessions.

## Order

| Stage | Items | Why this order |
| --- | --- | --- |
| 1 | A1–A6, J, I (static part) | Small fixes to pages people already use; no new tables. |
| 2 | B: notifications | Email is off, so this is the only way to reach people. E builds on it. |
| 3 | C1: repeat a game, H: group link | Cheap, and they save hosts the most time. |
| 4 | D: attendance and reliability | Needs B, so marked players are told. |
| 5 | E: phone notifications | Needs B's single write point, plus keys on Vercel. |
| 6 | F: venue map, G: suggest a venue, I (top 3) | Nice to have; F adds a dependency. |

**New migrations, in order:** `notifications` (B) · `games.group_link` (H) ·
`game_participants.attended` (D) · `push_subscriptions` and `games.reminded_at` (E) ·
`venue_suggestions` (G). Each runs on a fresh database before it is pushed (CI does this too).

## Decisions needed from the owner

| # | Question | Default if no answer |
| --- | --- | --- |
| D19 | Contact details for "Əlaqə" (email, Instagram, WhatsApp)? | Item A5 waits. |
| D20 | Wording: "Host" → "Təşkilatçı", plainer home-page line and footer? | Item A6 waits. |
| D21 | "Repeat": only a pre-filled form (C1), or real weekly games created automatically (C2)? | C1 only. |
| D22 | Is a player's attendance (D) visible to everyone, or only to hosts? | Everyone, shown only after 3 marked games. |
| D23 | Group link: WhatsApp only, or Telegram too? | Both. |
| D24 | "Starts in 2 hours" reminders need a check every 15 minutes. Vercel's free plan runs scheduled jobs once a day: upgrade, or use a free outside service (cron-job.org)? | Outside service. |
| D25 | Leaderboard default: this month or all time? | All time, with a "Bu ay" switch. |

---

## Stage 1: fixes to existing pages

### A1. Finished game page (S)
- **Sees:** a line "Oyun keçirilib · Cüm, 16 Okt" instead of the grey block. Under the score, who
  played on each side, and for a player "Siz qalib gəldiniz" / "Heç-heçə" / "Siz uduzdunuz".
- **Code:** `components/games/JoinPanel.tsx` (the `game.status !== 'open'` branch becomes a
  `styles.pastNote` line, as was done for "Dolu"); `components/games/ResultPanel.tsx` gets the two
  lineups from the participants it already reads (`lib/sides.ts` → `readSides`) and the viewer's
  outcome from `outcomeFor` in `lib/team-logic.ts`.
- **Tests:** if the viewer's outcome needs new logic, a unit test in `tests/team-logic.test.ts`
  (win, draw, loss, not a player).
- **Risk:** cancelled and live games share this branch; keep their labels from `STATUS_LABELS`.

### A2. "Bu meydançada oyun yarat" (S)
- **Sees:** a button on `/venues/[id]` that opens the create form with that venue chosen.
- **Code:** link to `/games/new?venue={id}`; `app/(frontend)/games/new/page.tsx` reads the param,
  checks the venue exists, passes `initialVenue` to `GameForm` → `VenuePicker`; the sport starts
  at the venue's first sport.
- **Tests:** the param parser in `lib/page-data.ts` (valid id, unknown id, junk).
- **Risk:** a venue that doesn't offer the chosen sport: the form already clears it on a sport
  change (`chooseSport`).

### A3. Leaderboard: your own row, this month (S)
- **Sees:** your row highlighted with "Siz"; a "Hamısı / Bu ay" switch.
- **Code:** `playerStandings(db, sport, since?)` and `teamRecords(db, ids, since?)` in
  `lib/records.ts` gain `AND g.scheduled_at >= since`; the month start comes from
  `lastBakuMonths(now, 1)`. `StandingsTable` takes `highlightId`; `Board` reads `getCurrentUser()`.
  New `?period=month` param, kept by `SportTabs` through `query`.
- **Tests:** extend `tests/leaderboard.test.ts` with a game from last month that drops out.

### A4. Profile tidy-up (S)
- **Sees:** one row of tabs instead of two; on laptops, no empty space under the name card.
- **Code:** `components/profile/ProfileTabs.tsx` and `ProfileGames.tsx`: one `SegmentedLinks` with
  "Qarşıdakı", "Keçmiş", "Təşkil etdiklərim"; `parseProfileTabs` and `profileTabsQuery` in
  `lib/game-backend.ts` map the old `?role=&when=` links onto it so saved links still work. The
  name card gets `align-self: start`.
- **Tests:** existing `parseProfileTabs` tests, plus the old-link mapping.

### A5. "Əlaqə" with your details (S, needs D19)
- `app/(frontend)/contact/page.tsx`: the owner's contacts as plain text plus links, kept next to
  the existing "ask the host" line.

### A6. Wording (S, needs D20)
- About 10 places say "Host" (`grep -rn "Host" components app`); the hero line is in
  `components/home/Hero.tsx`, the footer line in `components/site/Footer.tsx`. Text only.

### J. Shorter create form (S)
- **Sees:** "Komandalar və oyunçular (istəyə bağlı)" as one section that starts closed.
- **Code:** wrap the club pickers and `TeamSheet` in `components/create/GameForm.tsx` in a
  `<details>`, open by default when editing a game that has clubs or invited players. The date and
  time format switches stay untouched (owner's request).
- **Check:** a browser run: the closed section still submits, keyboard opens it, nothing is lost on
  close.

### I (part 1). "Necə işləyir" on the home page (S)
- Three short steps under the sport tabs: find a game, join, play. Static, in
  `app/(frontend)/page.tsx`.

---

## Stage 2: notifications (B, M)

**Sees:** a bell in the header with an unread count; `/notifications` lists "Siz gözləmə
siyahısından oyuna keçdiniz", "Oyunun vaxtı dəyişdi", "Oyun ləğv edildi", "Sizi oyuna dəvət
etdilər", "Hesab təsdiq gözləyir", "Rəqib hesabı təsdiqlədi", newest first, each opening its game.
Opening the page marks them read.

- **Data:** collection `collections/Notifications.ts`: `user` (relationship, indexed), `kind`
  (select: `invited`, `promoted`, `changed`, `cancelled`, `removed`, `resultReported`,
  `resultConfirmed`, later `reminder`), `game` (relationship, nullable, `ON DELETE SET NULL` so
  "cancelled" survives the game being deleted), `gameTitle` (text, for that case), `readAt`
  (date). Access: admin only on Payload's REST, like `game-waitlist`.
- **One write point:** `notify(payload, userIds, email)` in `lib/notify.ts` becomes
  `notify(payload, userIds, { kind, gameId, gameTitle }, email?)`. It writes one row per user, then
  sends the email if email is on. Every existing email already passes through it (directly or via
  `notifyPromoted` and `notifyInvited`), from `me/route.ts`, `games/route.ts`, `games/[id]/route.ts`,
  `players/[userId]`, `leave` and `invites`.
  New calls in `app/api/v1/games/[id]/result/route.ts` (tell the other side) and
  `result/confirm/route.ts` (tell the reporter). It still never throws.
- **API:** `GET /api/v1/me/notifications` (latest 50) and `POST /api/v1/me/notifications/read`
  (marks all read). Both signed in; rate limit as `userLookup`.
- **Badge:** `getNoticeCount` in `lib/session.ts` becomes unread notifications plus pending invites
  (invites stay actionable on the profile). Replaces `promotionCount`.
- **Cleanup:** `lib/cleanup.ts` deletes read notifications older than 90 days.
- **UI:** `app/(frontend)/notifications/page.tsx`, linked from the header and the phone menu (the
  badge moves from the avatar to the bell).
- **Tests:** a DB test that each event writes one row per person and none for the actor; unread
  count; mark read; one user can't read another's (`tests/notifications.test.ts`).
- **Risk:** the header renders on every page; the unread count must stay one indexed query
  (`user_id, read_at`).

---

## Stage 3

### C1. "Bu oyunu təkrarla" (S–M)
- **Sees:** on a game the viewer hosted, a button that opens the create form pre-filled: sport,
  venue, level, size, title, clubs, same time, next week's same weekday.
- **Code:** `/games/new?from={id}`; the page loads the game only if the viewer hosted it, and passes
  a `template` to `GameForm`, which already fills itself from `game` when editing. The template
  uses the same initial values but keeps `editing` false. Players and invites are not copied:
  everyone joins again.
- **Tests:** the date roll-forward (always in the future, in Baku time) in
  `tests/game-backend.test.ts`; someone else's game id gives a blank form.

### C2. Weekly games, created automatically (L, only if D21 says so)
- `games.series_id` and a daily cron that creates next week's game when this week's starts. Needs
  rules for cancelling a whole series and for clubs. Not before C1 has been used for a while.

### H. Group chat link on a game (S)
- **Sees:** an optional "Qrup linki" on the form; players who joined see "WhatsApp qrupuna qoşul".
- **Data:** `games.group_link` text, validated against `https://chat.whatsapp.com/…` (and
  `https://t.me/…` per D23).
- **Code:** parsed in `parseGameForm` (`lib/game-backend.ts`); revealed only where the host's phone
  is (participants and host, `getGameDetail`); nulled after 30 days by `cleanUpOldData` like the
  phones.
- **Tests:** link validation; not present in the public game JSON for a stranger.

---

## Stage 4: attendance and reliability (D, M)

- **Sees:** after kick-off the host ticks "Gəldi" or "Gəlmədi" for each player (up to 7 days
  after). Profiles show "Etibarlılıq: 12/13 oyun" once 3 games have been marked.
- **Data:** `game_participants.attended` boolean, null = not marked.
- **API:** `PATCH /api/v1/games/{id}/attendance` with `{ userId, attended }`, host only
  (`authorizeHost`), only between kick-off and +7 days; the player gets a notice (stage 2).
- **Code:** marking in `components/games/PlayersButton.tsx` (host view of a past game); the count in
  `gameCounts` (`lib/profile-queries.ts`), one more `count(*) FILTER`.
- **Tests:** host only, time window, count on profile.
- **Risk:** a host marking someone absent out of spite. Mitigations: the player is notified, and
  the number only shows after 3 marked games (D22).

---

## Stage 5: phone notifications (E, M)

- **Sees:** "Telefona bildiriş göndər" under "Hesab"; the phone shows the same messages as
  `/notifications`, plus "Oyununuz 2 saata başlayır". On iPhone it only works after "Add to Home
  Screen", which the switch explains.
- **Setup (owner):** VAPID keys generated once (`npx web-push generate-vapid-keys`) and stored on
  Vercel as `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (mailto:). Never
  committed.
- **Dependency:** `web-push` (the encryption and signing aren't a few lines), following
  `node_modules/next/dist/docs/01-app/02-guides/progressive-web-apps.md`.
- **Data:** `push_subscriptions`: `user`, `endpoint` (unique), `p256dh`, `auth`.
- **Code:** `public/sw.js` (show on `push`, open the game on `notificationclick`);
  `POST/DELETE /api/v1/me/push`; `notify` sends to the user's subscriptions after writing the
  notice and deletes subscriptions that answer 404/410.
- **Reminders:** `games.reminded_at`; `GET /api/cron/reminders` (behind `CRON_SECRET`, like
  cleanup) finds games starting within 2 hours that haven't been reminded, and notifies their players.
  Needs a run every 15 minutes (D24).
- **Tests:** subscription validation; stale subscriptions removed (web-push mocked); the reminder
  goes once per game.

---

## Stage 6

### F. Venue map (M)
- **Sees:** "Siyahı / Xəritə" on `/venues`; pins for venues with coordinates (12 of 14 today), a
  popup with name, sports, upcoming games and a link. Venues without coordinates stay in the list.
- **Dependency:** `leaflet` (no React wrapper), loaded only on that view with `next/dynamic`
  (`ssr: false`). OpenStreetMap tiles with the required attribution. Fine at this traffic; a paid
  tile service if it grows.
- **Code:** `components/venues/VenueMap.tsx`; data from `listVenues` (already has coordinates via
  `parseCoordinates`).
- **Tests:** the venue → pin mapping (skips missing coordinates); a browser run.

### G. "Meydança təklif et" (S–M)
- **Sees:** a form on `/venues` (signed in): name, district, address, sports, note. Thanks message;
  the admin sees it in Payload.
- **Data:** `venue_suggestions` (fields above, `submittedBy`, `status`), admin-only reads.
- **API:** `POST /api/v1/venue-suggestions`, rate limited (new `suggestVenue`: 5 a day).
  Approving means the admin creates the venue in the admin panel, as today.
- **Tests:** validation, rate limit, a non-admin can't read suggestions.

### I (part 2). Top 3 on the home page (S, after A3)
- "Ayın ən yaxşıları": the first three of each sport this month from `playerStandings(…, since)`,
  linking to `/leaderboard?period=month`. In its own `<Suspense>`, so the cached home page stays fast.

---

## Not planned (for now)

Chat inside the site (moderation); Elo ratings; Russian and English (waiting on D5); weekly
series (C2) until C1 has been used.
