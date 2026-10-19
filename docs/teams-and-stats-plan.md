# Teams (clubs), sides in a game, and stats: plan

> **Status: Phase 0 built, plus one security fix.**
> - The rules every later phase depends on are in `lib/team-logic.ts`, with 28 tests in
>   `tests/team-logic.test.ts`: sides, auto-balance, the side invariant, request parsing, the score's
>   report and confirm flow, club hand-over, and win/draw/loss records.
> - Payload's own REST API no longer lets a host write their game, or anyone write a team (§5,
>   `tests/collection-access.test.ts`).
>
> - **Phases 1–2 built**, to the bold options in §2 (still unanswered):
>   - migration `20261014_114826_teams_sides_and_results` adds clubs' `captain` and `inviteCode`,
>     players' `side` and the games' result fields. It backfills sides (host home, the rest
>     alternating), empties every score and every game's clubs (only the seed ever wrote them), and
>     runs `checkSides` on every game, failing if any game fails;
>   - joins pick a side under the game's row lock (`claimSpot`), an edit that leaves a side over
>     half is refused (`SIDE_FULL`), the join modal has the side picker and the players list shows
>     the two sides;
>   - not built from Phase 2: `hostSide` on create (the host is always `home` until a form asks),
>     and club names on the picker (no game has clubs until Phase 6).
>
> - **Phase 3 built:** `PATCH /api/v1/games/{id}/sides` (`lib/sides.ts`) moves players or balances, under the
>   game's row lock and ending in `checkSides`; the players dialog has the host's "⇄" and "Balansla"
>   buttons. `playerRecords` in `lib/sides.ts` is the SQL twin of `resultCounts`, which Phase 7 reuses.
>
> - **Phase 4 built:** `POST /api/v1/games/{id}/result` and `/result/confirm` (`lib/results.ts`) run
>   `nextResultStatus` under the game's row lock. The game detail carries `result`, `canReport` and
>   `canConfirm`, and the game page has a "Hesab" panel (`components/games/ResultPanel.tsx`).
>
> - **Phase 5 built:** the club routes (`lib/teams.ts`, `app/api/v1/teams/**`), account deletion
>   hands over each club the person captains, and the pages `/teams`, `/teams/new`, `/teams/[id]` and
>   `/teams/join/[code]`. Not yet: the club's record and the standings, which wait for Phase 7.
>
> - **Phase 6 built:** the create and edit forms take `homeTeamId` and `awayTeamId`, checked with
>   `clubSidesError` and `checkSides` in the transaction that writes the game. The form has a "Komandalar"
>   section, cards and the game page show "A vs B", and the join modal and players list name the sides
>   after their clubs.
>
> Phase 7 is not started.

What was asked:

1. **Persistent clubs.** Users create a named team, other users join it, and clubs play each other.
2. **Sides in every game.** A player joining a game either picks a side or lets the app pick one at
   random. The host can move players between sides or auto-balance them.
3. **The score is entered by the host and confirmed by a player on the other side.**
4. **Stats** for players and for clubs, based on that score.

---

## 1. What exists today

- `collections/Teams.ts` exists (name, shortName, sport, members) but **nothing in the app reads it**.
  Only `scripts/seed.ts` writes it.
- `Games` already has `homeTeam`, `awayTeam`, `homeScore` and `awayScore`, also written only by the
  seed. Both scores **default to 0**, so an unreported game can't be told apart from a 0–0 draw.
- A game's status follows the clock (`deriveAvailability`): `open`/`full` until it starts, then
  `live` for the sport's usual length, then `finished`. No job writes it, and this plan keeps that
  approach.
- The host is a participant in their own game (`createGame` inserts their row). The create form's
  `currentCount` can also reserve spots for **guests** (people without an account), who get no
  participant row.
- The profile's stats only count games played per sport (`lib/profile-queries.ts`). It has no
  wins or losses.

---

## 2. Decisions

**Taken:**

| Question | Decision |
| --- | --- |
| What a "team" is | A persistent club (members, captain), plus two sides in every game |
| Who splits the players | The player picks a side or "random" when joining; the host can reassign or auto-balance until kick-off |
| Who enters the score | The host enters it; a player on the other side confirms or disputes it |

**Open: the bold option is what I'd pick.**

| # | Question | Options |
| --- | --- | --- |
| D1 | Who can stand on a club's side? | **Members only** · anyone |
| D2 | How do people join a club? | **Invite link (the captain shares a code)** · request and captain approves · captain adds by name |
| D3 | Can a user be in several clubs? | **Yes, any number; each club has one sport** · one club per sport |
| D4 | A reported score nobody answers | **Counts as confirmed after 48h** (`AUTO_CONFIRM_HOURS`) · never counts |
| D5 | Who confirms? | **Any registered player on the other side** · only the other club's captain |
| D6 | Club vs club: does the away club have to accept? | **No: the host picks the away club and its members join that side** · challenge/accept step |
| D7 | Do games without clubs count toward a player's stats? | **Yes**, every confirmed game counts for each registered player in it |
| D8 | Guests (spots without an account) | **Play on the host's side, and fill the other side once the host's side is full** · the host assigns them |
| D9 | What auto-balance uses to judge strength | **Win rate with a prior** (`balanceRating`, a newcomer starts at 0.5) · Elo rating (later, if hosts ask) |
| D10 | A host deletes their account: their past games | **Stay, with no host** (so everyone's stats and club records keep them) · deleted, as today |
| D11 | A player leaves a club while on its side in an upcoming game | **Stays in the game**: membership is checked when joining and when sides change, not afterwards · removed from the game |
| D12 | The last member leaves a club | **The club stays, with no captain or members**, hidden from lists; its record still shows on old games · deleted |

Phase 0 is written to the bold options. Changing D1, D4, D5, D8 or D12 means editing one function each.

---

## 3. The model

```
Club (teams)                      Game
  name, sport, captain              homeTeam ── club or empty (empty = open side)
  members[]                         awayTeam ── club or empty
  inviteCode                        homeScore / awayScore (empty until reported)
                                    resultStatus: reported → confirmed | disputed
                                    resultReportedAt, resultConfirmedBy
                           participants
                              user, side: home | away     ← new
```

- **Each side holds half the game** (`maxPlayers / 2`; the create form already forces an even size).
- **Joining:** `side: 'home' | 'away' | 'random'`. "Random" takes the emptier side the player is
  allowed on, with a coin flip on a tie. A club side only admits that club's members (D1).
- **The host** can move players and press "Balansla" any time before the start. Auto-balance keeps
  the sides even in size first, then in strength. Club members are never moved off their club's side.
- **The score:**
  ```
  (empty) ──host reports──▶ reported ──other side confirms──▶ confirmed   (final; only an admin can change it)
                               │  ▲
            other side disputes│  │host re-reports
                               ▼  │
                            disputed
  reported + 48h without an answer ─────────────────────────▶ confirmed   (worked out on read, no cron)
  ```
- **Stats only count confirmed scores.** One function (`summarize`) turns a list of games into a
  record for a player (their side in each game) or a club (the side it stood on):
  - played, wins, draws, losses, win rate;
  - goals scored and conceded;
  - points (3 for a win, 1 for a draw);
  - form over the last five games.

  `compareStandings` orders a league table by points, then goal difference, then goals scored.

### Phase 0: the rules (built)

| Function in `lib/team-logic.ts` | Used by |
| --- | --- |
| `eligibleSides`, `pickSide`, `occupancy`, `parseSideChoice` | the join transaction (Phase 2), the side picker |
| `checkSides` | **every** change to sides: join, reassign, balance, resizing a game, changing its clubs (Phases 2, 3, 6) |
| `applyAssignments`, `parseSidesBody`, `autoBalance`, `balanceRating` | the host's moves and "Balansla" (Phase 3) |
| `nextResultStatus`, `effectiveResultStatus`, `parseResultBody` | the result endpoints and the game page (Phase 4) |
| `afterMemberLeaves` | leaving a club, removing a member, deleting an account (Phase 5) |
| `clubSidesError` | creating or editing a game with clubs (Phase 6) |
| `resultCounts`, `summarize`, `summarizeBySport`, `outcomeFor`, `compareStandings` | profile stats, the club page, standings (Phase 7) |

**The one invariant.** After any write that touches a game's sides, `checkSides` must pass: every
player stands on a side they're allowed on, and neither side holds more than half the game, guests
included. Every phase runs it inside the same transaction as its write, under `FOR UPDATE` on the
game row, and rolls back when it fails. Then no flow can leave a game in a state another flow
doesn't expect, whatever order things happen in.

---

## 4. Phases

Each phase is one PR that works on its own, in the same shape as the profile plan: a static shell
plus request data behind `<Suspense>`, and the existing components and tokens. Read `AGENTS.md`
first: this is Next 16 with `cacheComponents`.

### Phase 1: schema (one migration)

- **Teams:** add `captain` (user, optional: it's empty once the last member leaves, D12; the create
  endpoint sets it to the creator) and `inviteCode` (unique text, readable only by admins through
  Payload; the club endpoint returns it to the captain). Payload access stays as it is now: public
  read, admin-only writes. Every club write goes through `/api/v1` with `overrideAccess`, like games.
  Remove the "unused" comment from `collections/Teams.ts`.
- **GameParticipants:** add `side` (`home` | `away`, required). Backfill: the host's row gets
  `home`, and the other rows alternate by `created_at`.
- **Games:**
  - drop `defaultValue: 0` from both scores;
  - add `resultStatus`, `resultReportedAt` and `resultConfirmedBy`;
  - backfill the scores to null on every row, since no user has ever entered one.
- Update `scripts/seed.ts`:
  - seeded clubs get a captain;
  - every participant gets a side;
  - finished games get `resultStatus: 'confirmed'`.
- Regenerate `payload-types.ts`, then `npm run migrate`.
- **Done when:** the migration applies to a copy of production and `npm test` passes.

### Phase 2: sides when joining

- `POST /api/v1/games/{id}/join` accepts `side` (default `random`).
- Inside `claimSpot`, after the conditional `UPDATE games …` (which holds the game's row lock):
  1. Read the participant rows' sides.
  2. Work out the guests: `max − available − rows`.
  3. Call `occupancy` and then `pickSide`.
  4. Insert the row with that side.

  New codes `SIDE_FULL` and `NOT_A_MEMBER` (409) roll the whole join back, just as `ALREADY_JOINED`
  does today. The row lock serialises racing joins, so two players can't both take a side's last spot.
- `createGame` takes `hostSide` (default `home`).
- `PATCH /api/v1/games/{id}` (edit) runs `checkSides` with the new `maxPlayers`. A resize that would
  leave a side over half is refused with 409 `SIDE_FULL`, and the host moves players first.
- **UI:** the join panel gets a three-way control (`SegmentedLinks` styling):
  `[ A komandası | B komandası | Təsadüfi ]`, with club names in place of A/B when set, each showing
  its free spots. The game page's player list splits into two columns.
- **Tests:** extend `tests/join-game.test.ts` with these cases:
  - a full side is refused while the other side still has room;
  - "random" fills the emptier side;
  - a non-member is refused from a club side;
  - 20 concurrent joins never overfill a side.

### Phase 3: host reassign and auto-balance

- `PATCH /api/v1/games/{id}/sides`, host or admin only, before kick-off (`GAME_STARTED` otherwise).
  The body is `{ assignments: [{ userId, side }] }` or `{ balance: true }`.
  - `parseSidesBody` validates the body (400 `INVALID_SIDES`).
  - It runs in one transaction under `FOR UPDATE` on the game: read the rows, then
    `applyAssignments` (409 `NOT_IN_GAME` for a stranger), then `checkSides`, then write.
  - Balance reads each player's record (`summarize` → `balanceRating`), applies `autoBalance`, and
    then runs the same `checkSides`.
- **UI:** on the host's game page, each player row gets a "⇄" button that moves them to the other
  side, plus a "Balansla" button. Both use the existing button styles.
- **Tests:**
  - the host can move a player and other users get 403;
  - balancing 6 players gives 3 against 3;
  - club members stay on their club's side.

### Phase 4: score report and confirm

- `POST /api/v1/games/{id}/result` takes `{ homeScore, awayScore }`:
  - `parseResultBody` validates both as whole numbers from 0 to `MAX_SCORE` (300);
  - `nextResultStatus(…, 'report')` decides;
  - a report also resets `resultReportedAt` to now.
- `POST /api/v1/games/{id}/result/confirm` takes `{ action: 'confirm' | 'dispute' }` and sets
  `resultConfirmedBy`.
- The game detail response gains:
  - `result: { homeScore, awayScore, status }`, using `effectiveResultStatus`;
  - `canReport` and `canConfirm` for the viewer, so the page doesn't re-derive the rules.
- **Game page after the game:**
  - the host sees "Hesabı daxil et" with two number inputs;
  - a player on the other side sees "3 : 1 · Təsdiqlə | Etiraz et";
  - everyone else sees the score with "təsdiq gözləyir" until it is confirmed.
- **Tests:**
  - the state machine end to end through the routes;
  - a teammate of the host can't confirm;
  - a report becomes confirmed after 48h.

### Phase 5: clubs

- Endpoints:
  - `GET /api/v1/teams?sport=`: list and standings;
  - `POST /api/v1/teams`: create;
  - `GET /api/v1/teams/{id}`: the club, members, record and recent results;
  - `PATCH /api/v1/teams/{id}`: captain only;
  - `POST /api/v1/teams/{id}/join` with `{ code }`;
  - `POST /api/v1/teams/{id}/leave`. A leaving captain hands over to the longest-standing member
    (`afterMemberLeaves`).
  - `DELETE /api/v1/teams/{id}/members/{userId}`: the captain removes a member.
- `deleteMyAccount` runs `afterMemberLeaves` for each of the person's clubs, in its transaction.
- Invite codes come from `crypto.randomBytes(12)` as base64url, so guessing one is hopeless without
  a rate limit. The site has none today. The captain can make a new code, which retires the old link.
- Pages:
  - `/teams`: the list, with sport tabs reused from `/games`;
  - `/teams/new`;
  - `/teams/[id]`: the identity panel reused from the profile, record tiles reused from `StatTiles`,
    a members list, and for the captain the invite link with a copy button;
  - `/teams/join/[code]`: the landing page for an invite link. Signed-out visitors go through
    `proxy.ts` to `/login` and back.
- **Tests:**
  - only the captain can edit;
  - a wrong code is refused;
  - joining twice is a no-op.

### Phase 6: club sides in a game

- The create and edit forms get an optional "Komanda" section: home is one of my clubs of this sport,
  and away is any club of this sport or open.
- Validation: `clubSidesError` (each club plays the game's sport, and home and away differ), then
  `checkSides` on the players already in. The host standing on a club side they don't belong to
  fails there as `NOT_A_MEMBER`.
- The same two checks run on edit, so changing the sport or a club can't strand anyone. Adding a club
  to a side that already holds non-members is refused, and the host moves them first.
- Game cards and the detail page show "Club A vs Club B".

### Phase 7: stats

- **One query** for a person's confirmed games: their participant rows joined with games where the
  result counts. A score counts when the game isn't cancelled and
  `result_status = 'confirmed' OR (result_status = 'reported' AND result_reported_at <= now() - interval '48 hours')`.
  This is the SQL twin of `resultCounts`. A database test builds one game in each state and checks
  that the query and the function agree.
  `summarize` turns the rows into records, overall and per sport.
- **For a club**, the query is the same over games where `home_team_id = X OR away_team_id = X`.
- `GET /api/v1/me` and `GET /api/v1/users/{id}` gain `record` and `clubs`. `ProfileStats` shows:
  - W / D / L, win rate and goals as tiles;
  - form pills (Q / H / M = qələbə / heç-heçə / məğlubiyyət);
  - a "Komandalar" list.
- `/teams?sport=football` shows a standings table: # · Club · O · Q · H · M · Q:B · Xal.
- The games cache tag is expired on every result change (the collection hooks already do this). Club
  pages use their own `teams` tag.

---

## 5. What could break, and the guard for each

These are the existing code paths the feature touches. Each was read against today's code, and
each has a guard and a test planned.

| Path | What would break | Guard |
| --- | --- | --- |
| Payload REST `/api/games/{id}`, `/api/teams/{id}` | A host could set `status`, `availablePlayers`, a past `scheduledAt` (and later `resultStatus: 'confirmed'`) and skip every rule. Any user could edit or delete any team | **Fixed now:** writes are admin-only, and the app writes through `/api/v1` with `overrideAccess`. Test: `tests/collection-access.test.ts`, which fails on the old rules |
| `updateGame` (edit) | **Prerequisite, an existing race:** it reads `currentCount`, then writes `availablePlayers = max − currentCount` outside a transaction. A join or leave in between is overwritten, so the game is overbooked by one or loses a spot. With sides this also breaks the side caps | Before Phase 2: run the edit in a transaction with `FOR UPDATE` and write `available_players = available_players + (new_max − max_players)`, refusing below 0. Test: a join racing an edit |
| `deleteMyAccount` | **Prerequisite:** it deletes **every** game the person hosted, past ones too, which wipes those results from other players' stats and club records | Before Phase 4 (D10): delete only upcoming hosted games, keep past ones with `host` empty (make `host` optional, show "Silinmiş istifadəçi"). Test: a past game outlives its host's account |
| `claimSpot` / `releaseSpot` | A side overfilled by two racing joins | The side check runs after the `UPDATE` that takes the row lock. Leave only deletes a row, so it can't break the invariant |
| `createGame` | The host's own row and guests on no side | The host row gets `hostSide`, and guests are derived and placed by `occupancy` |
| `deleteGame` | — | Unchanged: it already refuses after kick-off and deletes the rows with the game |
| `toPlayer` / participants endpoint | The page can't tell the sides apart | Add `side` to the player shape. The participants list stays behind `isAdminOrParticipant` |
| Game status by clock | A score reported for a game that hasn't ended | `nextResultStatus` requires `finished`, from `deriveAvailability`, the same source the page uses |
| Cancelled after the fact | A cancelled game still counted | `resultCounts` drops cancelled games, and so does its SQL twin |
| Migration on existing data | Rows without a side, and 0–0 scores that look real | Backfill sides (host `home`, others alternating), then run `checkSides` on every game in the migration and fail it if any game fails. Null all scores |
| Payload types and the seed | Type errors after the schema change | Regenerate `payload-types.ts` in the same PR, and give the seed sides, captains and result statuses |
| Cache | Stale stats after a score | The result endpoints write through the Games collection, whose hooks already call `invalidateGamesCache`. Club pages get a `teams` tag |

## 6. Risks and edge cases

- **Collusion:** a host with friends on both sides can confirm any score. That is accepted for now,
  and D5 ("captain only") narrows it.
- **Deleting a played game erases it from everyone's stats.** The API already refuses deletes after
  kick-off (`GAME_STARTED`), but an admin deleting one in `/admin` still wipes its results.
- **Deleted accounts:** their participant rows go, so their games drop out of other players' lists,
  but the clubs' records stand, because they are read from the games.
- **Migration backfill:** alternating existing participants between the sides can't break a cap,
  because a game never has more rows plus guests than `maxPlayers`, and guests spill over. The
  migration still runs `checkSides` on every game to prove it.
- **No one left to confirm** (the other side is all guests, or its players deleted their accounts):
  the 48h auto-confirm covers it.
- **The Azerbaijani strings need a native speaker's read**, as in the earlier plans.

## 7. Skipped on purpose

These are skipped for now and can be added later:

- Elo or MMR ratings;
- per-player goals and assists;
- seasons and league fixtures;
- club chat;
- club logos (add an upload field to Teams when wanted);
- notifications for "your score is waiting for confirmation".
