# Teams (clubs), sides in a game, and stats: plan

> **Status: Phase 0 built.** The rules every later phase depends on are in `lib/team-logic.ts`,
> with tests in `tests/team-logic.test.ts`:
> - choosing a side;
> - auto-balancing the sides;
> - the score's report and confirm flow;
> - win/draw/loss records.
>
> Phases 1–7 are not started. The open decisions in §2 need an answer before Phase 1.

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

Phase 0 is written to the bold options. Changing D1, D4, D5 or D8 means editing one function each.

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
| `eligibleSides`, `pickSide`, `occupancy` | the join transaction (Phase 2), the side picker |
| `autoBalance`, `balanceRating` | the host's "Balansla" (Phase 3) |
| `nextResultStatus`, `effectiveResultStatus` | the result endpoints and the game page (Phase 4) |
| `summarize`, `outcomeFor`, `compareStandings` | profile stats, the club page, standings (Phase 7) |

---

## 4. Phases

Each phase is one PR that works on its own, in the same shape as the profile plan: a static shell
plus request data behind `<Suspense>`, and the existing components and tokens. Read `AGENTS.md`
first: this is Next 16 with `cacheComponents`.

### Phase 1: schema (one migration)

- **Teams:** add `captain` (user, required, set to the creator in `beforeValidate` the way Games sets
  `host`) and `inviteCode` (unique text, readable only by the captain and admins). Access:
  - read: public;
  - create: any signed-in user;
  - update and delete: the captain or an admin.

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
  - It runs in one transaction under `FOR UPDATE` on the game.
  - Every assignment is checked against `eligibleSides` and the side caps.
  - Balance reads each player's record (`summarize` → `balanceRating`) and applies `autoBalance`.
- **UI:** on the host's game page, each player row gets a "⇄" button that moves them to the other
  side, plus a "Balansla" button. Both use the existing button styles.
- **Tests:**
  - the host can move a player and other users get 403;
  - balancing 6 players gives 3 against 3;
  - club members stay on their club's side.

### Phase 4: score report and confirm

- `POST /api/v1/games/{id}/result` takes `{ homeScore, awayScore }`:
  - validate both as integers from 0 to 999 at the route;
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
  - `POST /api/v1/teams/{id}/leave`. The captain hands over the captaincy before leaving, or
    deletes the club.
  - `DELETE /api/v1/teams/{id}/members/{userId}`: the captain removes a member.
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
- Validation: the club's sport matches the game's, the host belongs to the home club, and home and
  away are different clubs.
- Edit can't change the clubs once someone has joined a club side (`SIDES_LOCKED`).
- Game cards and the detail page show "Club A vs Club B".

### Phase 7: stats

- **One query** for a person's confirmed games: their participant rows joined with games where the
  result counts. A score counts when
  `result_status = 'confirmed' OR (result_status = 'reported' AND result_reported_at <= now() - interval '48 hours')`.
  This is the SQL twin of `effectiveResultStatus`, and a test keeps the two in step.
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

## 5. Risks and edge cases

- **Collusion:** a host with friends on both sides can confirm any score. That is accepted for now,
  and D5 ("captain only") narrows it.
- **Deleting a played game erases it from everyone's stats.** The API already refuses deletes after
  kick-off (`GAME_STARTED`), but an admin deleting one in `/admin` still wipes its results.
- **Deleted accounts:** their participant rows go, so their games drop out of other players' lists,
  but the clubs' records stand, because they are read from the games.
- **Migration backfill:** alternating existing participants between the sides can't break a cap,
  because a game never has more rows than `maxPlayers`.
- **The Azerbaijani strings need a native speaker's read**, as in the earlier plans.

## 6. Skipped on purpose

These are skipped for now and can be added later:

- Elo or MMR ratings;
- per-player goals and assists;
- seasons and league fixtures;
- club chat;
- club logos (add an upload field to Teams when wanted);
- notifications for "your score is waiting for confirmation".
