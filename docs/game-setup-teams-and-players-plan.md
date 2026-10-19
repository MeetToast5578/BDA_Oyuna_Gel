# Choosing teams and players when you create a game: plan

> **Status: Phases 8, 9 and 10 are built. Phase 11 is not (only if asked for).** Decisions D13–D18
> in §3 are still unanswered, and the code follows the bold option of each.
>
> **Where the build differs from the text below:**
> - **Accepting has no route of its own.** The invited player joins through the existing join flow
>   (`/games/{id}?join=1&side=…`), and the join route marks the invite accepted whichever way they
>   joined (`markInviteAccepted`). This reuses the phone and name step, the rate limit and the join
>   audit log, and so there is no second place that can break a side's size. `POST /invites/{id}/decline`
>   is the only answer route.
> - **Inviting after creation is on the game page**, not the edit form: a "Oyunçu dəvət et" panel for the
>   host (search, "invite the whole club", who is pending or declined, take back). The create form
>   only queues invites with the game.
> - **Invites cascade.** `game_invites` has `ON DELETE CASCADE` on the game and the player (edited from
>   what Payload generated, and its `down` fixed), so deleting a game or an account needs no extra
>   delete. A host limit of 60 invites an hour replaces the shared join/leave limit.
> - **The player search has no rate limit** (the log that join and leave share would have counted every
>   keystroke against joining). It is signed-in only, 2 characters, 8 results, public fields only.
> - **Declining is final** for that game: the host can't invite the same player again; a player who
>   accepted and then left can be.
> - **New in Phase 8, not planned:** the host-side choice wraps on a phone, and `?join=1&side=` also
>   works signed out (sign in, then back to the join form).
>
> Follows `docs/teams-and-stats-plan.md`, whose Phases 0–7 are built (clubs, sides, score, records,
> and a "Komandalar" picker on the create form). This plan covers what is still missing. It reuses
> `lib/team-logic.ts` and the invariant `checkSides`.

## 1. What the create form can and can't do today

| The host wants | State on `Branch-1` |
| --- | --- |
| Pick the two clubs | **Built** (`GameForm`, `homeTeamId` / `awayTeamId`, checked by `clubSidesError` and `checkSides` in `createGame` and `updateGame`). But the whole "Komandalar" section is **hidden** unless some club of the chosen sport already has members (`clubsOfSport.length > 0`, `GameForm.tsx`; `clubOptions` in `lib/teams.ts` skips empty clubs). A host with no clubs around sees no teams at all and no hint that clubs exist or how to make one |
| Pick which side they play on | **Built** (`hostSide`, written to the host's participant row) |
| Say who the players are | **Missing.** The only input is `currentCount`, an anonymous number of guests with no account. There is no way to name a person, and nobody is told a game exists. Players find the game and join on their own |
| Remove someone | **Missing.** Only a player can leave; the host has no remove button. The host can move a player to the other side (Phase 3), not out |
| Find a person to add | **Missing.** There is no user search; `GET /api/v1/users/{id}` needs the id |
| The away club agrees to play | **Missing.** The host names any club with members (D6, taken). That club's captain isn't told and can't say no |
| Organise a game between two clubs without playing | **Not allowed.** The club on the host's side must be one of theirs |

So "which teams" is mostly there but hard to find; "which players" doesn't exist.

## 2. What to build, in order

```
Phase 8   make the teams section findable; the away captain can decline
Phase 9   host removes a player; a link to one side
Phase 10  invite players by name
Phase 11  (optional) closed games, guests per side
```

Phases 8 and 9 need no new table. Phase 10 adds one.

## 3. Decisions

**Open: the bold option is what I'd pick.**

| # | Question | Options |
| --- | --- | --- |
| D13 | Can a host organise a game without playing in it? | **No: the host is always a player, on the side they choose** · yes, as a neutral organiser (changes "the host is a participant" in `createGame`, `releaseSpot`, the spot counts and the score flow) |
| D14 | What does "choose the players" mean? | **Pre-fill: the host invites named people to a side; the game stays open to anyone else** · closed game: only invited people and club members can join (Phase 11) |
| D15 | Does a pending invite hold a spot? | **No: it carries a side, and the spot is taken when the person accepts** · yes (needs expiry and a way to free the spot) |
| D16 | Add a player directly, or invite? | **Invite; the person accepts.** Adding without asking would put someone into a game, and into their win/loss records (D7), without consent · add directly |
| D17 | Does the away club have to agree? (revisits D6) | **No, but its captain can decline afterwards**, which makes that side open · challenge/accept step first |
| D18 | Who shows up in the player search? | **Any signed-in user, by name; name and photo only** (what a public profile already shows) · a profile switch to opt in or out |

## 4. Phases

Each phase is one PR that works on its own. Read `AGENTS.md` first: this is Next 16 with
`cacheComponents`, and its docs are in `node_modules/next/dist/docs/`. Each change gets a test that
fails on the old code, and the full check in `docs/handoff.md` §6 runs before every push.

### Phase 8: the teams section findable, and the away club's say

- **Always show "Komandalar".** With no club for the sport, show a one-line hint and a "Komanda yarat"
  link to `/teams/new` that opens in a new tab, so the half-filled form isn't lost.
- **Better options.** `ClubOption` (`lib/teams.ts`) gains `memberCount`, so the select reads
  "Alpha · 7 üzv" and a host can tell clubs apart. An empty club stays out of the list.
- **Away club can decline (D17).** `POST /api/v1/games/{id}/decline-club`, the captain of the game's
  away club (or an admin), before kick-off. It clears `awayTeam` under the game's row lock. Players
  already on that side stay valid, because an open side admits anyone. The game page shows the
  captain a "Oyundan çəkil" button.
- **The captain has to find out.** The club page (`/teams/[id]`) gets a "Qarşıdakı oyunlar" list (games
  where the club is a side). This also lets members find their club's game and join it, which stands
  in for a notification while email is on hold. It needs a club filter on the games query; size it when
  starting.
- **Tests:** the section renders with no clubs; only the away captain can decline; the side is open
  afterwards and `checkSides` still holds; the club page lists a club's upcoming game.

### Phase 9: remove a player, and a link to one side (no new table)

- **Host removes a player.** `DELETE /api/v1/games/{id}/players/{userId}`, host or admin, before
  kick-off (`GAME_STARTED` after). It calls `releaseSpot` for the row delete and the spot hand-back
  (the host can't remove themselves: `HOST_CANNOT_LEAVE` stays). The removed player is told through
  `notify`. The players dialog (`PlayersButton`) gets a "Çıxar" button next to "⇄".
- **Link to a side.** `JoinPanel` preselects the side from `?side=home|away`. In Next 16 `searchParams`
  is a promise, so the game page awaits it inside its `<Suspense>` and passes the value down. The share
  menu (`ShareButton`) offers one link per side. A club side already refuses non-members, so a captain
  can drop the link in the club's WhatsApp group. That gets most of "my friends join my side" before
  any invite system.
- **Tests:** only the host can remove; the spot is free again; a second removal is `NOT_JOINED`;
  `?side=` preselects the side.

### Phase 10: invite players by name

- **Schema (one migration).** Collection `game-invites`: `game`, `user`, `side`, `invitedBy`, `status`
  (`pending` | `accepted` | `declined`), unique on (`game`, `user`). Payload access stays admin-only;
  writes go through `/api/v1` with `overrideAccess`, like games.
- **Search.** `GET /api/v1/users?q=`: signed-in only, 2 characters minimum, 8 results at most, only
  `{ id, name, initials, avatarUrl }`, never email or phone. It leaves out the caller and anyone already
  in the game, and shares the join/leave rate limit (`join-attempts`).
- **Invite.** `POST /api/v1/games/{id}/invites` with `{ userId, side }`: host only, before kick-off.
  Refused when the person is already in or invited, when the side isn't one they may stand on
  (`eligibleSides` with their clubs, so a non-member can't be invited to a club side), or when the game
  already has `maxCount` pending invites. The create body may carry `invites: [{ userId, side }]`,
  which the server writes in the same transaction as the game.
- **Invite a whole club.** When a side has a club, "Bütün üzvləri dəvət et" invites its members who
  aren't in the game yet, up to the side's free spots.
- **Answer.** `GET /api/v1/me/invites`, `POST /api/v1/invites/{id}/accept` and `…/decline`. **Accept is a
  normal join**: it calls `claimSpot` with the invite's side, so every join rule applies, and a full
  game or side refuses it with the invite still pending. After kick-off an invite expires on read, like
  the 48h score confirm, with no cron.
- **Seen where.** Email is on hold (`docs/handoff.md` §4), so an invite has to show in the app: a badge
  on the header's profile link and an "Dəvətlər" list on `/profile`. When Gmail goes live, `notify`
  sends the same invite by email.
- **UI.** An "Oyunçular" section on the create and edit form: two columns (A, B) with slots, "Oyunçu
  əlavə et" opening a search box, each invited person a chip whose status shows on the game page. The
  "Mövcud iştirakçı sayı" stepper stays for people without an account.
- **Tests:** an invite carries its side; accepting joins on that side; a club side refuses an invite
  for a non-member; a full game refuses the accept and the invite stays; 20 concurrent accepts never
  overfill a side; search returns no email or phone.

### Phase 11 (optional, only if asked for)

- **Closed game** (D14, second option): `joinPolicy: 'open' | 'invited'`. `claimSpot` then requires an
  accepted invite or club membership.
- **Guests per side:** store `guestsHome` / `guestsAway` in place of the derived guest count, so a host
  can say who the anonymous players stand with. Not worth it while guests stand with the host (D8).

## 5. What could break, and the guard for each

| Path | What would break | Guard |
| --- | --- | --- |
| `decline-club` | Racing a join or an edit | Runs under `FOR UPDATE` on the game, then `checkSides`; clearing a club can only widen who may stand on a side |
| `releaseSpot` for the host's remove | Removing the host; racing the player's own leave | `HOST_CANNOT_LEAVE` stays; the row `DELETE … RETURNING` makes the second removal `NOT_JOINED` |
| Invite accept | An invite jumping the side or spot rules | Accept is `claimSpot` unchanged; the invite only carries the side |
| Create with `invites` | An invite for a user who can't stand on that side | The same `eligibleSides` check, run before the game is written |
| User search | Listing every account's name | Signed-in only, 2 characters, 8 results, rate limit, name and photo only |
| Invite spam | A host inviting hundreds | At most `maxCount` pending per game, the rate limit, and decline is one tap |
| Seed and types | Type errors after the schema change | Regenerate `payload-types.ts`; add invites to the seed |

## 6. Risks and edge cases

- **An invite nobody sees is useless while email is on hold.** The badge, the club page's list and the
  side links (Phase 9) carry it until Gmail is approved.
- **A host outside both clubs can't host a club game.** That is D13's "No"; a neutral organiser is a
  bigger change, not a switch.
- **People without an account** can't be invited; they stay guests, or the host sends the game link.
- **A club's captain leaves** (`afterMemberLeaves`): games already created keep the club.
- **The Azerbaijani strings need a native speaker's read.** New: Komanda yarat, üzv, Oyundan çəkil,
  Qarşıdakı oyunlar, Çıxar, Oyunçular, Oyunçu əlavə et, Bütün üzvləri dəvət et, Dəvətlər, Qəbul et,
  Rədd et.

## 7. Skipped on purpose

Neutral organiser (D13), closed games and guests per side (Phase 11), a "recent teammates" shortcut in
the search, push notifications, club chat.
