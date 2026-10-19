# Fixes and user-experience improvements: plan

> **Status: stages 1–3 built.** This plan covers the bugs found while planning teams
> ([teams-and-stats-plan.md](teams-and-stats-plan.md) §5), the broken Vercel preview, and the UX
> improvements suggested alongside them. Every step names the files it touches, how it is tested,
> and when it counts as done. Decisions waiting on the owner are in §2.
>
> - **Built:** A1, A2 (with D1 as recommended: past games stay, without a host), B1–B4, C1, C2. Each
>   was checked with the tests, a production build, and a browser on desktop and phone sizes.
> - **Built since:** D1 email notifications, sent through Gmail (D2: Gmail SMTP with an App Password,
>   `GMAIL_USER` / `GMAIL_APP_PASSWORD`), on by default with a switch on the profile (D3). Join
>   confirmations carry the calendar file; changed times or venues and cancellations (a deleted game,
>   or the upcoming games of a deleted account) go to everyone in the game.
> - **Built since:** D2 rate limits on join and leave (429 `RATE_LIMITED`, `tests/rate-limit.test.ts`).
> - **Built since:** stage 5, the waitlist (E1), to D4's first option, but with the "you got a spot" notice
>   **in the app** (a profile panel and the header's count) because email is on hold: the email is sent
>   too, and starts reaching people when Gmail is configured. Differences from §8: promotion is
>   `promoteWaiting` in `lib/join-game.ts` (so `releaseSpot` can call it without an import cycle), a
>   person who can't stand on the side with room is passed over and keeps their place, the host's
>   removal of a player promotes too, the list is capped at 30, and a direct join drops the person's
>   sign-up. People waiting for a game whose host deletes their account are not told.
> - **Not started:** stage 0 (the owner's, in the Vercel dashboard), stage 7. Stage 6 (teams)
>   has phases 1–2 built; see the teams plan's status.
> - **Where the build differs from the text below:**
>   - A2 also clears the deleted host's contact number from the games that stay.
>   - A host whose account is gone shows as "Silinmiş istifadəçi"; an account with no name still
>     shows "OyunaGəl istifadəçisi".
>   - B1's share panel shows the WhatsApp link on every device, not only as a fallback.
>   - B2's calendar links appear on the game page once joined, not inside the join modal.
>   - C1's level and venue filters apply to the past list too; the date presets only to upcoming
>     games, since they only look ahead.
> - **Needs a native speaker's read:** the new Azerbaijani strings (share, calendar, filters, venue
>   pages, the account-deletion dialog).

All work happens on `Branch-1`. Nothing goes into `main` until the owner merges it.

---

## 1. Order

| Stage | What | Size | Needs |
| --- | --- | --- | --- |
| 0 | Fix the Vercel preview (owner, in the dashboard) | 15 min | nothing |
| 1 | **Bugs:** A1 edit race · A2 account deletion keeps past games | S + S | D1 |
| 2 | **Quick wins:** B1 share and link previews · B2 add to calendar · B3 sitemap and robots · B4 install on phone | S each | nothing |
| 3 | C1 more filters on `/games` · C2 venue pages with a map | M + M | nothing |
| 4 | D1 email notifications · D2 rate limits | M + S | D2, D3 |
| 5 | E1 waitlist for full games | M | stage 4, D4 |
| 6 | Teams, phases 1–7 ([teams-and-stats-plan.md](teams-and-stats-plan.md)) | L | stage 1 |
| 7 | F1 Russian and English | L | D5 |

- **Why this order:**
  - Stage 1 comes first because teams depends on both fixes, and users can hit both bugs today.
  - Stages 2–3 touch none of the files teams changes, so they can run alongside it.
  - The waitlist needs a way to tell someone they got a spot, which is why stage 4 comes before it.
  - Translation comes last because it touches every page, so it's cheapest once the pages stop
    changing.
- **Size:** S is under a day, M is 1–3 days, L is a week or more.
- **Each item is one commit or a short series, on `Branch-1`.** Each ends with the full check in §10
  passing.

---

## 2. Decisions for the owner

| # | Question | Recommendation |
| --- | --- | --- |
| D1 | A host deletes their account: what happens to games they hosted that already happened? | **Keep them, with no host**, so the other players keep their history and stats. Upcoming ones are still deleted |
| D2 | Which email provider? | **Resend** (free tier, one API key, official Payload adapter) · or any SMTP account through the Nodemailer adapter |
| D3 | Do players get emails by default? | **Yes for things about games they joined, with an off switch on the profile**. Nothing promotional |
| D4 | A spot frees up in a full game | **The first person waiting gets it automatically and is emailed** · or everyone waiting is emailed and the first to click gets it |
| D5 | Languages and URLs | **Russian and English, at `/ru/...` and `/en/...`, with Azerbaijani unprefixed** (decide when stage 7 starts) |

---

## 3. Stage 0: the Vercel preview

**Problem.** Every preview build fails in about 25 seconds. The same command, `npm run vercel-build`,
passes here once `PAYLOAD_SECRET` and `DATABASE_URL` are set, so the preview environment is
missing them.

**Steps** (owner, Vercel dashboard → project `bda-oyuna-gel` → Settings → Environment Variables):

1. Create a **separate database for previews**, for example a Neon branch or a second free
   Postgres. **This matters for safety:** `vercel-build` runs `payload migrate` against whatever
   `DATABASE_URL` points at. If previews shared production's database, every migration pushed to
   `Branch-1` (teams adds several) would change live data before anyone merged it.
2. Add these variables, ticking **Preview** only:
   - `PAYLOAD_SECRET`: any long random string, different from production's;
   - `DATABASE_URL`: the preview database;
   - `BLOB_READ_WRITE_TOKEN`: from a separate Blob store, so test uploads stay out of production's.
3. Optional, for Google sign-in on previews: add `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`
   (Preview). In Google Cloud, add
   `https://bda-oyuna-gel-git-branch-1-redoze.vercel.app/api/auth/google/callback` as a redirect URI.
   That URL is fixed for the branch.
4. Redeploy the latest `Branch-1` deployment. After that, every push builds a working preview.
5. Fill the preview database once: run `DATABASE_URL=<preview url> npm run seed` locally.

**Done when:** the PR's Vercel check is green, and the preview link opens the home page and
`/admin`.

---

## 4. Stage 1: bugs

### A1: editing a game can overbook it or lose a spot

**Problem.** `PATCH /api/v1/games/{id}` reads the game's player count (`getGameDetail` →
`currentCount`). Later, `updateGame` writes `availablePlayers = maxCount − currentCount`, outside
any transaction (`lib/game-queries.ts`, `updateGame`).
- If someone joins in between, the write undoes their spot: one player more than the game holds.
- If someone leaves in between, the write loses the freed spot.
- The edit can also land just after kick-off, even though the route checked a moment earlier that
  the game hadn't started.

**Fix.** Let Postgres do the arithmetic on the row it has locked, the same way `claimSpot` and
`releaseSpot` already work.

1. In `updateGame`, open a transaction (`payload.db.beginTransaction()`, as `createGame` does) and
   start with one statement:
   ```sql
   UPDATE games
   SET max_players = ${maxCount},
       available_players = available_players + (${maxCount} - max_players),
       updated_at = now()
   WHERE id = ${gameId}
     AND status = 'scheduled'
     AND scheduled_at > now()
     AND available_players + (${maxCount} - max_players) >= 0
   RETURNING id
   ```
   Postgres computes every `SET` from the row as it was before the update, and holds the row lock
   until commit, so a join or leave either lands before (and is counted) or waits.
2. No row returned → find out why, the way `claimSpot`'s `rejectionReason` does:
   - the game is missing: 404;
   - it has started: 409 `GAME_STARTED`;
   - otherwise it's too small: 409 `MAX_COUNT_BELOW_PLAYERS`, with the real count.
3. Then `payload.update` the other fields in the same transaction. Drop `maxPlayers` and
   `availablePlayers` from its `data`, and pass `req: { transactionID }`. Commit, then call
   `invalidateGamesCache()`, as today.
4. The route's early `isUpcoming` check and `parseEditGameBody(…, existing.currentCount)` stay.
   They give a quick answer in the common case, and the SQL is the real check.
5. **Teams note:** teams Phase 2 adds `checkSides` with the new size to this same transaction.

**Tests** (`tests/game-freeze.test.ts` or a new `tests/edit-game.test.ts`, against Postgres). Each
reproduces the race in a fixed order:
- read the detail (1 player), let another user join with `claimSpot`, then save an edit to 10 with
  the stale input. Expect `availablePlayers` 8, not 9;
- the same, but shrink to exactly the stale count. Expect `MAX_COUNT_BELOW_PLAYERS`, and nothing
  changed;
- an edit on a game whose `scheduledAt` has just passed gets `GAME_STARTED`.

**Done when:** the three tests fail on today's code and pass with the fix.

### A2: deleting an account erases other people's history (D1)

**Problem.** `deleteMyAccount` (`lib/profile-queries.ts`) deletes **every** game the person hosted,
including past ones. Those games vanish from every other player's "Keçmiş" list and stats, and they
would vanish from club records once teams lands.

**What's already in place.**
- `games.host_id` has `ON DELETE SET NULL` (baseline migration), but the column is `NOT NULL`, so
  the games had to be deleted.
- The UI already copes with a game whose host is gone. `normalizeGameRecord` gives `host.id: null`,
  and the game card and the game page then show the name without a link.

**Fix.**
1. `collections/Games.ts`: drop `required: true` from `host`. The create path keeps setting it, so
   nothing new can be created without a host.
2. Migration (`npx payload migrate:create keep_past_games_of_deleted_hosts`):
   `ALTER TABLE games ALTER COLUMN host_id DROP NOT NULL`. Check the generated file contains only
   that, then regenerate `payload-types.ts` (`npx payload generate:types`) and fix the type errors
   it raises (the host becomes optional).
3. `deleteMyAccount`: delete only hosted games that haven't started
   (`status = 'scheduled' AND scheduled_at > now()`), with their participant rows, as now.
   - Started, live, finished and cancelled games stay.
   - Deleting the user row then sets their `host_id` to null by itself, through the existing
     foreign key.
4. **Their uploads:** a kept game's cover may be a picture the deleted host uploaded, and the
   uploads are deleted after the commit. `games.cover_image_id` is already `ON DELETE SET NULL`, so
   the cover falls back to the venue or sport picture (`resolveCoverImage`) with no change needed.
5. `getGameHostId` returns null for a game with no host, and the edit and delete routes answer 404.
   That's right: the game has started and only admins may touch it.
6. Optional wording: show "Silinmiş istifadəçi" instead of the generic default name when
   `host.id` is null.

**Tests** (`tests/profile.test.ts`, Postgres): user A hosts one past and one upcoming game, and
user B joined both. After A deletes their account:
- the upcoming game is gone;
- the past game is still there, with host null;
- B's past list still shows it, and B's played count is unchanged;
- the migration applies on a copy of the seed data.

**Done when:** the test passes, `npm run typecheck` is clean, and a past game with a deleted host
renders on its page and on a card.

---

## 5. Stage 2: quick wins

### B1: share button and link previews

**Problem.** Sending a game to a WhatsApp group is how a pickup game fills, but the link shows no
preview, and the page has no share button.

1. **`metadataBase`** in `app/(frontend)/layout.tsx`. It comes from `NEXT_PUBLIC_SITE_URL`, falling
   back to `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`, then to localhost. Without it,
   preview images get relative URLs that WhatsApp can't load.
2. **The game's preview image:** `app/(frontend)/games/[id]/opengraph-image.tsx`, using
   `ImageResponse` from `next/og`. See `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/01-metadata/opengraph-image.md`.
   - Size 1200×630: the sport emoji, title, "Şən, 18 Okt · 19:00", the venue, and "3 yer qalıb" or
     "Oyun doludur".
   - It reads the game with `getGameDetail(id, null)`.
   - **Check:** that ə, ş, ğ, ı, ö, ü and ç render. If the default font lacks any of them, load a
     TTF of the site's font with `fetch(new URL('./font.ttf', import.meta.url))`.
   - One for the site: `app/(frontend)/opengraph-image.png`, a static file.
3. **`generateMetadata`** on the game page gains `openGraph: { title, description }`, with the date,
   venue and free spots in the description.
4. **`components/games/ShareButton.tsx`** (client): "Paylaş" next to the join panel.
   - It uses `navigator.share({ title, text, url })` where the browser has it (phones).
   - Otherwise it copies the link and says "Link kopyalandı" in an `aria-live` region, plus a
     "WhatsApp" link to `https://wa.me/?text=<title + url>`.
   - It uses the existing `buttonClass` and `Icon`.

**Tests:** a unit test for the share text builder. By hand: paste a preview URL into WhatsApp, and
check that `curl <url>` has `og:image`.

**Done when:** a shared link shows a card with the game's details.

### B2: add to calendar, with a reminder

**Problem.** Players forget games, and there is no reminder system. A calendar file with an alarm
gives a reminder two hours before **without building any scheduler**, because the player's phone
does the reminding.

1. **`toIcs(game)`** in `lib/game-backend.ts` (pure). It builds one `VEVENT`:
   - `DTSTART` in UTC;
   - `DTEND` = start + `SPORT_META[sport].durationMinutes`;
   - `SUMMARY`, `LOCATION` (venue name and address), `URL`, and `UID` = `game-<id>@oyunagel`;
   - plus `BEGIN:VALARM … TRIGGER:-PT2H`.

   Follow RFC 5545 exactly:
   - CRLF line endings;
   - `,`, `;`, `\` and newlines escaped;
   - lines folded at 75 octets (Azerbaijani letters take 2 bytes each).
2. **Route:** `GET /api/v1/games/{id}/calendar` returns it as
   `text/calendar; charset=utf-8`, with `Content-Disposition: attachment; filename="oyun-<id>.ics"`.
   It's public, because a game page is public.
3. **UI:** an "Təqvimə əlavə et" link on the game page for players who joined, and in the join
   confirmation step ("Bir addım qaldı"). Beside it goes a Google Calendar link
   (`https://calendar.google.com/calendar/render?action=TEMPLATE&text=…&dates=…&location=…`).

**Tests:** `toIcs` unit tests for the escaping, the folding of a long Azerbaijani title, the UTC
times, and the end time per sport.

**Done when:** the file imports into iPhone, Google and Outlook calendars with a two-hour reminder.

### B3: sitemap and robots

1. `app/sitemap.ts` lists the home page, `/games`, `/games/past`, `/about`, `/rules`, `/privacy`,
   `/contact`, and every upcoming game (`findGames`, all pages).
2. `app/robots.ts` keeps search engines out of `/admin`, `/api`, `/profile`, `/login` and
   `/games/new`, and points them to the sitemap. Public profiles already carry `noindex`.

**Done when:** `/sitemap.xml` and `/robots.txt` are served, and the sitemap contains only public
pages.

### B4: install on phone

1. `app/manifest.ts` (Next's `MetadataRoute.Manifest`):
   - name "OyunaGəl", `start_url: '/'`, `display: 'standalone'`;
   - the theme and background colours from the tokens in `globals.css`;
   - 192 and 512 px icons in `public/icons/`, made from the logo.
2. `app/apple-icon.png` (180 px), for the iPhone home screen.
3. No offline mode or push notifications yet: both need a service worker, which is a separate job.

**Done when:** Chrome on Android offers "Install app", and the iPhone's "Add to Home Screen" uses
the icon.

---

## 6. Stage 3: finding games

### C1: more filters on `/games`

**What exists.** The API already accepts `from`, `to` and `status=open`
(`parseGameListParams`). The page only exposes sport.

1. **New list parameters** in `parseGameListParams`:
   - `level=beginner|medium|high`;
   - `venue=<id>`;
   - `date=today|tomorrow|weekend`.

   `date` becomes `from`/`to` in Baku time (`startOfBakuDay`, where the weekend is Saturday 00:00 to
   Monday 00:00). Unknown values get 400 errors, as the existing parameters do.
2. **`findGameDocs`** (the cached query) takes `level` and `venueId` as arguments and adds them to
   the `where`. Since they are arguments, each combination is its own cache entry and still
   expires with the games tag.
3. **The page:** a filter row under `SportTabs`:
   - date as `SegmentedLinks` (`Hamısı | Bu gün | Sabah | Həftəsonu`);
   - level as a select;
   - venue as a select (the venue list comes from `GET /api/v1/venues`);
   - "Filtrləri sıfırla".

   Every filter lives in the URL, as `?sport=` does today, so a filtered list can be shared and the
   back button works. On phones the row scrolls sideways.
4. **"Daha çox"** fetches further pages from the API: `GamesGrid` calls
   `withQuery(endpoint, { ...query, page })`. **The page's `query` must include the new
   parameters**, or page 2 comes back unfiltered. Add a test that it stays filtered.
5. **Empty state:** "Bu filtrlərə uyğun oyun yoxdur" with a reset link (the existing `EmptyState`).
6. The sport tabs keep counting by sport only. Making them follow the other filters is a later
   choice.

**Tests:**
- `parseGameListParams` with every new value and a bad one;
- Baku weekend edges (Sunday 23:30 is in the weekend, Monday 00:00 is not);
- `findGames` with each filter against Postgres;
- page 2 stays filtered.

**Done when:** each filter narrows the list, combines with sport, survives a reload, and paging
keeps it.

### C2: venue pages with a map

**What exists.** Arenas already have `address`, `district`, `coordinates` ("lat,lng", with a
`parseCoordinates` helper), a photo and their sports.

1. **`/venues`:** the list, with cards reused from the game card layout (photo, name, district,
   sports).
2. **`/venues/[id]`:**
   - the photo, address and sports;
   - "Xəritədə aç", a link to `https://www.google.com/maps/search/?api=1&query=<lat>,<lng>` (falling
     back to the address). It needs no API key and opens the maps app on phones;
   - optionally an OpenStreetMap embed (no key either). Check that no Content-Security-Policy
     header blocks the iframe;
   - "Bu meydançada oyunlar": the upcoming games list filtered with `venue=<id>` from C1.
3. The venue name on game cards and the game page links to its venue page.
4. `generateMetadata` and `notFound()` for an unknown id, as the game page does.

**Tests:** the maps link builder, with and without coordinates; a 404 for a missing venue.

**Done when:** a player can go from a game to its venue, open directions, and see the other games
there.

---

## 7. Stage 4: notifications and abuse limits

### D1: email notifications (D2, D3)

The groundwork for the waitlist (E1) and for teams' "your score is waiting for confirmation".
Players sign in with Google, so every account already has an email address.

1. **Adapter:** add `@payloadcms/email-resend` (or `@payloadcms/email-nodemailer`, D2) and an
   `email:` entry in `payload.config.ts`.
   - New variables: `RESEND_API_KEY` and `EMAIL_FROM`.
   - Without the key, Payload's console fallback stays, as it is now ("No email adapter provided"),
     so local runs and tests send nothing.
2. **User setting:** an `emailNotifications` checkbox on Users (default on, D3), editable in "Profili
   redaktə et".
3. **One sender:** `lib/notify.ts`, `notify(userIds, template, data)`.
   - It skips users who turned emails off.
   - It logs failures and **never throws**, like `recordJoinAttempt`: an email problem must never
     fail a join or a leave.
   - It runs after the response, through Next's `after()` (check
     `node_modules/next/dist/docs` for `after` before use).
4. **First emails:**
   - joined: confirmation, with the `.ics` from B2 attached;
   - the host changed the time or venue: to everyone who joined;
   - the game was cancelled or deleted: to everyone who joined;
   - from the waitlist: you got a spot (E1).

   Plain HTML in Azerbaijani, with the game link. The unsubscribe link goes to the profile setting.
5. **Later, needs a scheduler:** a "starts in 2 hours" email. The `.ics` alarm from B2 covers this
   for now. A scheduled job would be an `/api/cron/reminders` route protected by a `CRON_SECRET`
   header and called by Vercel Cron or a GitHub Actions schedule. Check the Vercel plan's cron
   limits first, and add a `remindedAt` on participants so nobody gets two.

**Tests:**
- `notify` with an adapter stub: it respects the setting, and an adapter error doesn't throw;
- a cancel sends to every participant except the host.

**Done when:** joining sends a confirmation with a calendar file, and turning the setting off stops
the emails.

### D2: rate limits

**Problem.** Nothing limits how often an account can call join, leave or (later) the club invite
endpoint.

1. **Reuse the existing log.** `join-attempts` already records every join with its user, IP and time.
   A helper `tooManyRecentAttempts(userId, ip)` counts that user's (and that IP's) rows in the last
   minute. Over 10, the join route answers 429 `RATE_LIMITED` ("Çox tez-tez cəhd edirsiniz. Bir
   dəqiqə sonra yenidən yoxlayın.") before touching the game.
2. **The same helper** serves leave and, later, the club invite join (teams Phase 5), with a `kind`
   column added to the log.
3. **Index:** the log already has indexes on `user_id` and `created_at` (baseline migration),
   which is enough at this size. A combined `(user_id, created_at)` index can come later if the
   log grows large.
4. **Optional, no code:** a Vercel Firewall rate-limit rule on `/api/v1/*`, if the plan includes it.

**Tests:** the 11th attempt in a minute gets 429 and the game is untouched; after a minute it goes
through again.

**Done when:** a script hammering the join endpoint is refused, and normal use never is.

---

## 8. Stage 5: waitlist for full games (D4)

**Problem.** A full game is a dead end. When someone leaves, nobody hears about the free spot.

1. **Collection `game-waitlist`:** `game`, `user`, `name`, `phone` (both given when signing up for
   the list, as in the join form) and `createdAt`.
   - Unique on `(game, user)`.
   - The same access rules as participants (only you and admins read your row).
   - A migration creates it.
2. **Endpoints:**
   - `POST /api/v1/games/{id}/waitlist`: only while the game is upcoming and full, and not for
     someone already playing.
   - `DELETE /api/v1/games/{id}/waitlist`.
   - The game detail response gains `waitlist: { count, yourPosition }`.
3. **Promotion inside `releaseSpot`.** After the participant row is deleted, in the same
   transaction, take the first person waiting:
   `SELECT … FROM game_waitlist WHERE game_id = $1 ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED`.
   - If someone is waiting, insert them as a participant and delete their waitlist row. **Don't**
     increment `available_players`: the spot changes hands.
   - If nobody is waiting, increment it, as today.
   - After the commit, `notify` them (D1).
4. **The same promotion** runs wherever spots come back:
   - an edit that makes the game bigger (A1's transaction): promote up to the number of new spots;
   - `deleteMyAccount`, which today returns spots with one bulk `UPDATE`. It needs a loop over those
     games, one promotion each.
5. **With teams:** the promoted player gets a side from `pickSide(…, 'random', …)`, then
   `checkSides` runs, in the same transaction.
6. **UI (JoinPanel, full state):**
   - "Oyun doludur · Gözləmə siyahısına yazıl", and "3 nəfər gözləyir" when others are waiting;
   - once on the list: "Siz 2-cisiniz · Siyahıdan çıx".
7. **Edge cases:**
   - no promotions after kick-off;
   - a promoted player can leave like anyone else, which promotes the next person;
   - the host can't join their own waitlist.

**Tests (Postgres):**
- a leave promotes the earliest person and availability stays 0;
- two simultaneous leaves promote two different people;
- an empty list returns the spot;
- promotion stops once the game has started;
- resizing promotes the right number of people.

**Done when:** a player who leaves a full game is replaced by the first person waiting, and that
person gets an email.

---

## 9. Stage 7: Russian and English (D5)

The largest change, because every Azerbaijani string is written directly into components and API
messages.

1. **Collect** the strings into `lib/i18n/az.ts`, keyed by screen, and replace each literal with a
   lookup. Behaviour doesn't change, so this step can ship on its own.
2. **Locale in the URL** (`/ru/...`, `/en/...`, with Azerbaijani unprefixed). A URL segment keeps
   pages cacheable under `cacheComponents`. A cookie-chosen language would make every page depend on
   the request. This restructures `app/(frontend)` under a `[locale]` segment: read Next's
   internationalization guide in `node_modules/next/dist/docs` first.
3. **API errors** keep a stable `code`, and the page translates it, so the API needs no language.
4. **Translations** by native speakers. A language switcher in the header and footer, plus
   `hreflang` alternates in the metadata.

**Done when:** every page and error reads correctly in all three languages, and the Azerbaijani
URLs are unchanged.

---

## 10. How every change is checked before it's pushed

This is the same routine used for the teams work. It runs on the local Postgres in the container:

```bash
pg_ctlcluster 16 main start          # once per session
export DATABASE_URL=postgres://oyuna:oyuna@localhost:5432/oyuna PAYLOAD_SECRET=local-test-secret
npx payload migrate                  # the new migration applies
npm run typecheck && npm run lint    # 0 errors
npm test                             # every suite, database tests included
npm run vercel-build                 # the same build Vercel runs
```

- A bug fix starts with a test that fails on the current code (as `tests/collection-access.test.ts`
  did).
- UI changes are also opened on the Vercel preview once stage 0 is done.
- New Azerbaijani strings are listed in the commit for a native speaker to read.
