# Handoff: teams, fixes and UX work on `Branch-1`

Written at the end of the session of 14 October 2026, so the next session can pick up without
re-deriving anything. Read this first, then `AGENTS.md` (Next 16 with `cacheComponents`; read
`node_modules/next/dist/docs/` before using a Next API).

---

## 1. Ground rules from the owner

- **Work only on `Branch-1`.** Never push to `main`, merge, or rebase it. The owner merges when ready.
- PR [MeetToast5578/BDA_Oyuna_Gel#14](https://github.com/MeetToast5578/BDA_Oyuna_Gel/pull/14) is the
  draft PR for `Branch-1`. Keep it a draft and its description current.
- **Nothing on this branch may touch the live database.** See §5: the live database URL is shared
  with Vercel previews today, so don't add it anywhere new.
- **Never commit secrets.** The owner shared a `.env` with the live values in the previous session;
  don't copy them into files, commits, PR text or logs. `.env*` is git-ignored.
- **Gmail is on hold** until the product owner approves it (§4). Don't ask for or add Gmail
  credentials.
- Each change gets a test that fails on the old code, then passes; and the full check in §6 runs
  before every push.
- Azerbaijani UI strings need a native speaker's read. List new ones in the commit or plan.

---

## 2. What's on the branch (ahead of `main` at `07828b2`)

| Commit | What |
| --- | --- |
| `7e60647` | Teams plan (`docs/teams-and-stats-plan.md`) and the pure team rules (`lib/team-logic.ts`) |
| `e7754b3` | **Security:** Payload's own `/api/games` and `/api/teams` take writes from admins only (hosts could set `status`, `availablePlayers`, a past date). Test: `tests/collection-access.test.ts` |
| `4c2a3fc` | Deeper team rules: `checkSides` (the one invariant every side change must pass), parsers, club hand-over. Plan §5: every existing path the feature touches, with its guard |
| `0d8fe4e` | `docs/fixes-and-ux-plan.md`: staged plan for fixes and UX (its status block is current) |
| `5691543` | **Bug A1:** editing a game resizes it on the locked row, so a join or leave during an edit isn't lost; an edit after kick-off is refused. Test: `tests/edit-game.test.ts` |
| `0072945` | **Bug A2:** deleting an account keeps the past games that person hosted (host becomes null, contact phone cleared). Migration `20261014_093046_keep_past_games_of_deleted_hosts` |
| `b79f259` | Share button and WhatsApp link, link-preview images (`opengraph-image.tsx`), calendar file with a 2-hour reminder (`/api/v1/games/{id}/calendar`, `lib/calendar.ts`) |
| `22efd06` | `sitemap.xml`, `robots.txt`, web app manifest and icons |
| `c295457` | `/games` filters: `date=today|tomorrow|weekend`, `level`, `venue` (API and page) |
| `51b4bd6` | `/venues` and `/venues/{id}` with "Xəritədə aç" and the venue's games |
| `e579069` | Plan status update |
| `49b4908` | Email notifications through Gmail SMTP, **dormant** until configured (§4). Migration `20261014_111042_user_email_notifications` |
| `772faae` | **Rate limits:** join and leave answer 429 `RATE_LIMITED` after 10 requests a minute per user or IP, counted from `join-attempts`. Test: `tests/rate-limit.test.ts` |
| `2c236f5` | **Teams phases 1–2:** migrations `20261014_114826_teams_sides_and_results` (sides backfilled and proved with `checkSides`; scores and games' clubs emptied) and `20261014_115147_join_outcome_side_codes`; sides picked in `claimSpot`; `SIDE_FULL` on edit; side picker and two-column players list |
| `b6814be` | Polish: level/venue filters on the past list, "Silinmiş istifadəçi" for a deleted host, `/api/v1/me/games` no longer logs the prerender bail-out |

**Tests:** 206 passing across 17 files (`npx vitest run` against a local Postgres; see §6).

---

## 3. What to do next

Items 1–3 of the previous list (rate limits, teams phases 1–2, polish) are built. Next:

1. **Teams phase 3** is built (`lib/sides.ts`, `PATCH /api/v1/games/{id}/sides`, the host's buttons in
   `components/games/PlayersButton.tsx`). `playerRecords` there is the stats query Phase 7 needs.
2. **Teams phases 4–7** in order (score report and confirm, clubs, club sides, stats).
3. Left out of phase 2 on purpose: `hostSide` on create (the host is always `home`), and club
   names on the side picker (no game has clubs until phase 6).
4. **Blocked:**
   - the waitlist (stage 5) needs email, which is on hold;
   - Russian and English (stage 7) need D5 (which languages, which URLs);

---

## 4. Email (built, on hold)

- **How it's wired:**
  - `payload.config.ts` uses `@payloadcms/email-nodemailer` (3.89.0) with Gmail SMTP **only when**
    `GMAIL_USER` and `GMAIL_APP_PASSWORD` are both set. Otherwise Payload just logs
    "Email attempted without being configured".
  - `lib/emails.ts` holds the texts (titles escaped).
  - `lib/notify.ts` has `notify`, which skips users who opted out and never throws; `afterResponse`,
    which uses `after()` and runs the task immediately outside a request; and `participantIds`.
- **What sends:**
  - a join confirmation, with the `.ics` file;
  - when a host changes the time or venue, an email to everyone in the game;
  - when a host deletes an upcoming game, or deletes their account, an email to everyone who joined.
- **Users** have `emailNotifications` (default on) and a switch under "Hesab" on `/profile`.
- **To turn it on later:** use a dedicated free Gmail account. Turn on 2-Step Verification, create an
  App Password, and set both variables in Vercel. The Google sign-in keys can't send mail. A free
  account sends to about 500 people a day.

---

## 5. Vercel and the database

- **`bda-next`** (`prj_0jNsSRGI6zJYapdyk6MSLjkbxnhn`, team `redoze`) is the live site.
  - It has **no Git connection**: it is deployed by hand, so pushes never build there.
  - Its `DATABASE_URL` and other variables target production and preview, so a `bda-next` preview
    would still use the live database. **Don't deploy `Branch-1` there.** Its settings were left
    exactly as they were.
- **`bda-oyuna-gel`** (`prj_XhiPU2mjlB97OjJ5GYlGPgfHJ799`, same team) is the **public copy of
  `Branch-1`**, at https://bda-oyuna-gel.vercel.app:
  - connected to GitHub, with Branch Tracking set to `Branch-1`: every push to `Branch-1` updates
    that address;
  - `DATABASE_URL` and `PAYLOAD_SECRET` (production and preview) point at the Neon `preview`
    branch (`ep-old-haze-aeykpqkm`), never the live database. The first build ran every
    migration from the baseline (it was empty), and one build ran the seed (48 players, 12 venues,
    137 games); the build command is back to the default;
  - Vercel Authentication is off for this project only, so the link can be shared;
  - `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` are the live site's OAuth client; Google sign-in
    works once `https://bda-oyuna-gel.vercel.app/api/auth/google/callback` is an authorized
    redirect URI on that client (the owner adds it in Google Cloud);
  - no Blob token, so uploads don't work there.
- The owner was advised to rotate the database password and the Google client secret at some
  point, since they were pasted into an earlier chat.
- `lib/site-url.ts` points previews at their branch URL and production at
  `VERCEL_PROJECT_PRODUCTION_URL`. `NEXT_PUBLIC_SITE_URL` overrides both.

---

## 6. Working setup in a fresh container

```bash
npm ci                                   # works again: the lock file was fixed in 49b4908
pg_ctlcluster 16 main start              # Postgres 16 is installed; start it in every new container
su postgres -c "psql -c \"CREATE USER oyuna WITH PASSWORD 'oyuna' SUPERUSER;\" -c 'CREATE DATABASE oyuna OWNER oyuna;'"   # first time only
export DATABASE_URL=postgres://oyuna:oyuna@localhost:5432/oyuna PAYLOAD_SECRET=local-test-secret
npx payload migrate
npm run seed                             # sample data, local database only
npx tsc --noEmit && npx eslint . && npx vitest run && npm run vercel-build
```

- **Lint:** `npx eslint .` shows 0 errors. The ~20 warnings are unused `payload`/`req` arguments in
  Payload-generated migrations; leave them as generated.
- **Browser checks:**
  - Start the build with `npx next start -p 3100`.
  - Playwright lives at `/opt/node22/lib/node_modules/playwright`. Use
    `chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })`. Don't run
    `playwright install`.
  - To sign in, `POST /api/users/login` with a local test user; the site accepts `payload-token`.

**Gotchas that cost time in the last session:**

- **Stopping servers.** `pkill -f "next start"` (or any pattern that also appears in the same command
  line) kills your own shell. Stop servers in a separate command:
  `ps -eo pid,cmd | awk '$2 ~ /^next-server/ {print $1}' | xargs -r kill`. Then confirm none are
  left before starting a new one. An old server on port 3100 makes the new one fail with
  `EADDRINUSE`, and you end up testing the old build: stale CSS returns 500s, and new routes are
  missing.
- **Turbopack and symlinks.** It refuses a symlinked `node_modules`, so a `git worktree` with a
  linked `node_modules` can't build. To build an older commit: `git stash -u`, build, then
  `git stash pop`.
- **Next's cache in tests.** Functions with `'use cache'` (`findGames`, `findVenues`, …) can't run in
  Vitest. Check them against the running build with `curl` instead.
- **Hidden pages in the DOM.** Next 16 keeps the previous page hidden in the DOM after client
  navigation. In Playwright, count `article:visible`, not `article`, and wait for a heading unique to
  the new page.
- **One-off scripts.** Scripts that need Payload must live inside the repo and run with
  `npx payload run scripts/<file>.ts`. Delete the file afterwards.
- **`after()` outside a request.** It throws when a test calls a route handler directly; use
  `afterResponse` from `lib/notify.ts`.

---

## 7. Map of the new code

| Area | Files |
| --- | --- |
| Team rules (pure) | `lib/team-logic.ts`, `tests/team-logic.test.ts` |
| Edit race fix | `lib/game-queries.ts` (`updateGame`, `editRejection`), `app/api/v1/games/[id]/route.ts` |
| Account deletion | `lib/profile-queries.ts` (`deleteMyAccount`), `components/profile/DeleteAccount.tsx`, `collections/Games.ts` (`host` optional) |
| Sharing and calendar | `components/games/ShareButton.tsx`, `lib/calendar.ts`, `app/api/v1/games/[id]/calendar/route.ts`, `lib/game-backend.ts` (`shareText`), `app/(frontend)/**/opengraph-image.tsx`, `lib/site-url.ts` |
| SEO and app | `app/sitemap.ts`, `app/robots.ts`, `app/manifest.ts`, `public/icons/`, `app/apple-icon.png` |
| Filters | `lib/game-backend.ts` (`parseGameListParams`, `datePresetWindow`), `lib/page-data.ts` (`listFiltersFromSearchParams`), `components/games/GamesFilters.tsx`, `SportTabs.tsx`, `GamesSection.tsx` |
| Venues | `app/(frontend)/venues/`, `lib/game-queries.ts` (`listVenuePages`, `getVenuePage`), `lib/game-backend.ts` (`mapsUrl`, `venueImageUrl`) |
| Email | `payload.config.ts`, `lib/emails.ts`, `lib/notify.ts`, `components/profile/EmailNotifications.tsx`, `collections/Users.ts` |
| Docs | `docs/teams-and-stats-plan.md`, `docs/fixes-and-ux-plan.md`, `docs/api.md`, `README.md` |
