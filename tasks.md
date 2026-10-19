# Tasks for `Branch-1`

Built from `docs/handoff.md` and the plan docs in `docs/`. Tick a box when the work is committed,
tested and reviewed. Work only on `Branch-1`; never touch the live database.

## A. Build now (not blocked)

### Teams phase 3: host moves players and auto-balance
- [x] `PATCH /api/v1/games/{id}/sides` for the host or an admin, before kick-off. Body is
      `{ assignments }` or `{ balance: true }`; one transaction under `FOR UPDATE`. Errors: 400
      `INVALID_SIDES`, 409 `NOT_IN_GAME`, 409 `GAME_STARTED`.
- [x] UI: "⇄" move button on each player row and a "Balansla" button on the host's game page.
- [x] Tests: host can move a player and others get 403; balancing 6 players gives 3 against 3; club
      members stay on their club's side.

### Teams phase 4: score report and confirm
- [x] `POST /games/{id}/result` (`{ homeScore, awayScore }`, whole numbers 0–300).
- [x] `POST /games/{id}/result/confirm` (`{ action: confirm | dispute }`).
- [x] `result`, `canReport`, `canConfirm` on the game detail response.
- [x] Game page UI: "Hesabı daxil et" (host), "Təsdiqlə | Etiraz et" (other side), "təsdiq gözləyir"
      (everyone else).
- [x] Tests: state machine through the routes; a host's teammate can't confirm; auto-confirm after 48h.

### Teams phase 5: clubs
- [x] Endpoints: `GET/POST /teams`, `GET/PATCH /teams/{id}`, `POST /teams/{id}/join` (invite code),
      `POST /teams/{id}/leave`, `DELETE /teams/{id}/members/{userId}`.
- [x] Captain hand-over on leave (`afterMemberLeaves`), also inside `deleteMyAccount`.
- [x] Invite codes from `crypto.randomBytes(12)`; captain can regenerate.
- [x] Pages: `/teams`, `/teams/new`, `/teams/[id]`, `/teams/join/[code]`.
- [x] Tests: only the captain can edit; wrong code refused; joining twice is a no-op.

### Teams phase 6: club sides in a game
- [x] Optional "Komanda" section on the create and edit forms.
- [x] Validate with `clubSidesError` and `checkSides`, also on edit.
- [x] Show "Club A vs Club B" on cards and the game page.

### Teams phase 7: stats
- [x] Confirmed-games SQL query (twin of `resultCounts`) with a test that one game in each state
      agrees with the function.
- [x] `record` and `clubs` on `GET /me` and `GET /users/{id}`.
- [x] `ProfileStats`: W/D/L tiles, form pills, "Komandalar" list.
- [x] Standings table on `/teams?sport=` (no `teams` cache tag: the club pages aren't cached).

### Phase 2 leftovers
- [x] `hostSide` on game create.
- [x] Club names on the side picker (needs phase 6).

## B. Blocked on the owner

- [ ] **Waitlist for full games** (`docs/fixes-and-ux-plan.md` stage 5): needs email approved.
- [ ] **Turn on email:** dedicated Gmail account, App Password, `GMAIL_USER` / `GMAIL_APP_PASSWORD`
      in Vercel.
- [ ] **Russian and English** (stage 7): needs decision D5 (languages and URLs).
- [ ] **Native-speaker review** of the new Azerbaijani strings.
- [ ] Teams plan decisions D1–D12 (the code assumes the bold options).

## C. Owner / ops housekeeping

- [ ] Add `https://bda-oyuna-gel.vercel.app/api/auth/google/callback` as a redirect URI in Google Cloud.
- [ ] Rotate the database password and Google client secret.
- [ ] Confirm stage 0 (Vercel preview) is done; update `docs/fixes-and-ux-plan.md` if so.
- [ ] Add a Blob token if uploads should work on `bda-oyuna-gel`.
- [ ] Run `npm run migrate` (migration `20260925_065346`) before the profile-picture version serves traffic.
- [ ] Merge draft PR [MeetToast5578/BDA_Oyuna_Gel#14](https://github.com/MeetToast5578/BDA_Oyuna_Gel/pull/14)
      when ready (owner only).

## D. Optional or skipped on purpose

- [ ] Profile T4.5: cache `getPublicProfile` (skipped: `next/cache` breaks the database tests).
- [ ] "Starts in 2 hours" email (needs a cron route and `remindedAt`).
- [ ] Combined `(user_id, created_at)` index on `join-attempts` if the log grows.
- [ ] Not planned: Elo, per-player goals, seasons, club chat, club logos, "score waiting" emails.

## For every item

- [ ] Test that fails on the old code first, then passes.
- [ ] `npx payload migrate && npm run typecheck && npm run lint && npm test && npm run vercel-build`
      before pushing.
- [ ] Review the diff adversarially before each commit.
- [ ] Push only to `Branch-1`; list new Azerbaijani strings in the commit.
