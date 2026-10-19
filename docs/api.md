# OyunaGəl API

The homepage, game and venue endpoints live under `/api/v1`. Payload's own REST API (collections, auth) stays at `/api/*`, which is why the two don't share paths: a custom `/api/games` route would shadow Payload's and break the admin panel.

All times in responses are ISO 8601 UTC. Every display label (`dateLabel`, `timeLabel`, `relativeTimeLabel`, `sportLabel`, `levelLabel`, `venue.label`) is computed server-side in `Asia/Baku`, so the frontend never does timezone math.

Errors always have the shape:

```json
{ "error": { "code": "GAME_FULL", "message": "Oyunda boş yer qalmayıb." } }
```

## Screens → endpoints

| Screen (Figma)                          | Endpoint                                             |
| --------------------------------------- | ---------------------------------------------------- |
| Hero carousel                           | `GET /api/v1/games/featured`                         |
| Sport tabs ("Futbol · 18 açıq oyun")    | `GET /api/v1/sports`                                 |
| "Açıq oyunlar" grid, "Daha çox"         | `GET /api/v1/games?page=N`                           |
| "Keçmiş oyunlar" (`/games/past`)        | `GET /api/v1/games?when=past&page=N`                 |
| Empty state ("Hələ açıq oyun yoxdur")   | `GET /api/v1/games?sport=…` returning `games: []`    |
| Oyun Detalı                             | `GET /api/v1/games/{id}`                             |
| İştirakçılar (the avatar row's list)    | `GET /api/v1/games/{id}/participants`                |
| Komandaları dəyiş / Balansla (host)     | `PATCH /api/v1/games/{id}/sides`                     |
| Komandalar (list)                       | `GET /api/v1/teams?sport=…`                          |
| Komanda yarat                           | `POST /api/v1/teams`                                 |
| Komanda səhifəsi                        | `GET /api/v1/teams/{id}`                             |
| Komandaya qoş / çıx / üzvü çıxar        | `POST /teams/{id}/join` · `/leave` · `DELETE /teams/{id}/members/{userId}` |
| Hesabı daxil et (host)                  | `POST /api/v1/games/{id}/result`                     |
| Təsdiqlə / Etiraz et (other side)       | `POST /api/v1/games/{id}/result/confirm`             |
| Qoşulma modalı, addım 1 → addım 2       | Client-side only; nothing is sent yet                |
| "Bir addım qaldı" → "Qoşulmanı təsdiq et" | `POST /api/v1/games/{id}/join` (returns host phone) |
| Yeni Oyun Yarat: Meydança picker        | `GET /api/v1/venues?sport=…&q=…`                     |
| Yeni Oyun Yarat: "Oyunu dərc et"        | `POST /api/v1/games`                                 |
| Oyunu redaktə et (host only)            | `PATCH /api/v1/games/{id}`                           |
| Oyunu sil (host only)                   | `DELETE /api/v1/games/{id}`                          |
| Oyundan çıx (game page, profile cards)  | `POST /api/v1/games/{id}/leave`                      |
| Profil                                  | `GET` / `PATCH` / `DELETE /api/v1/me`                |
| Mənim oyunlarım                         | `GET /api/v1/me/games?role=…&when=…`                 |
| Başqa oyunçunun profili                 | `GET /api/v1/users/{id}`                             |
| Daxil ol                                | Google only, see [Accounts](#accounts)               |

Joining and creating games require a signed-in account. The create form asks for the host's phone (prefilled from the profile); the host name is taken from the account. The join modal is a two-step wizard: step 1 collects the player's name and phone, step 2 shows the host and sends them.

## Game status

Every game carries a server-computed `status` and `remainingSpots` (`lib/game-backend.ts` → `deriveAvailability`). Display these; never recompute them from the counts.

The status follows the clock; no job writes it. A game is `open`/`full` until its start, `live` for
the sport's usual length (`SPORT_META.durationMinutes`: football 90, basketball 60, tennis 90
minutes), then `finished`. A status stored on the game (`cancelled`, or one an admin sets) wins.
Once a game has started it is part of its players' history: it can no longer be joined, left,
edited, or deleted by its host.

| `status`    | Meaning                                          | Joinable |
| ----------- | ------------------------------------------------ | -------- |
| `open`      | Upcoming and at least one spot left              | yes      |
| `full`      | Upcoming, no spots left                          | no       |
| `live`      | Started, and within the sport's usual length     | no       |
| `finished`  | Over                                             | no       |
| `cancelled` | Cancelled                                        | no       |

## Game card

Returned by the list, featured and detail endpoints.

```json
{
  "id": "12",
  "title": "Cümə axşamı 5-ə-5",
  "sport": "football",
  "sportLabel": "Futbol",
  "level": "medium",
  "levelLabel": "Orta səviyyə",
  "venue": {
    "id": "3",
    "name": "Aku Arena",
    "label": "Aku Arena — Nizami, Bakı",
    "district": "Nizami",
    "address": "Nizami, Bakı",
    "city": "baku",
    "cityLabel": "Bakı",
    "coordinates": { "lat": 40.4, "lng": 49.87 },
    "sportTypes": ["football"]
  },
  "district": "Nizami",
  "startsAt": "2026-08-02T16:00:00.000Z",
  "dateLabel": "Baz, 2 Avq",
  "timeLabel": "20:00",
  "relativeTimeLabel": "Bu gün · 20:00",
  "currentCount": 11,
  "maxCount": 12,
  "remainingSpots": 1,
  "status": "open",
  "teams": { "home": { "id": "7", "name": "Qarabağ Veteranlar" }, "away": null },
  "coverImageUrl": "/api/media/file/cover-1600x900.webp",
  "coverImage": {
    "thumbnailUrl": "/api/media/file/cover-480x270.webp",
    "fullUrl": "/api/media/file/cover-1600x900.webp",
    "fallbackUrl": "/images/game-football-1-7880cc.png"
  },
  "host": { "id": "4", "name": "Elvin Abbasov", "initials": "EA", "avatarUrl": null }
}
```

`teams` is the club on each side of the game; `null` is a side open to anyone. The card shows
"Qarabağ Veteranlar vs Açıq" when either side has a club, and the join modal and players list name
the sides after their clubs.

- The card line "Aku Arena · Nizami, Bakı · Orta səviyyə" is `venue.name · venue.district, venue.cityLabel · levelLabel`.
- "6/10 oyunçu" / "4 yer qalıb" are `currentCount/maxCount` and `remainingSpots`.
- `relativeTimeLabel` is `Bu gün · HH:mm`, `Sabah · HH:mm`, the weekday within the week, or the date beyond it.
- `coverImage.fallbackUrl` is always the sport's default image, for an `onError` handler.
- `host.id` is what the host's name links to (`/users/{id}`, see [`GET /api/v1/users/{id}`](#get-apiv1usersid)).
  It is `null` only for a game whose host account no longer exists.

## `GET /api/v1/sports`

Sport tabs. Every known sport is listed, including those with no open games.

| Query  | Default | Notes                                        |
| ------ | ------- | -------------------------------------------- |
| `city` | `baku`  | `baku` or `Bakı`. Unknown → `400 UNKNOWN_CITY` |

```json
[
  { "sport": "football", "label": "Futbol", "iconKey": "football", "openGamesCount": 18 },
  { "sport": "basketball", "label": "Basketbol", "iconKey": "basketball", "openGamesCount": 9 },
  { "sport": "tennis", "label": "Tennis", "iconKey": "tennis", "openGamesCount": 7 }
]
```

Only `open` games count. The query is cached (Next data cache, tag `games`, refreshed at least every 60 s). Any game, venue or participant change and every successful join expire it immediately.

## `GET /api/v1/games`

The "bu gün / sabah" grid and the "Hamısına bax" list, soonest first. With `when=past`, "Keçmiş
oyunlar" instead: games that have already started, most recent first, whatever their `from`/`to`.
Cancelled games are left out of it (it lists games that happened; a player's own history under
`GET /api/v1/me/games?when=past` still shows them).

| Query    | Default                    | Notes                                                        |
| -------- | -------------------------- | ------------------------------------------------------------ |
| `sport`  | all                        | `football`, `basketball`, `tennis`. Else `400 INVALID_SPORT` |
| `city`   | `baku`                     | As above                                                     |
| `from`   | now                        | ISO 8601 with offset, e.g. `2026-09-14T00:00:00+04:00`. Clamped to now: started games are never listed |
| `to`     | end of tomorrow, Baku time | ISO 8601, exclusive. Pass a later date for "Hamısına bax"    |
| `status` | open and full              | `open` → only games with spots left                          |
| `date`   | none                       | `today`, `tomorrow` or `weekend` (Saturday–Sunday in Baku; on a weekend day, from now to Monday). Replaces `from`/`to`. Else `400 INVALID_DATE_FILTER` |
| `level`  | all                        | `beginner`, `medium`, `high`. Else `400 INVALID_LEVEL`. Ignored with `when=past` |
| `venue`  | all                        | A venue id from `GET /api/v1/venues`. Else `400 INVALID_VENUE`. Ignored with `when=past` |
| `page`   | `1`                        | 1-based                                                      |
| `limit`  | `12`                       | 1–50                                                         |
| `when`   | `upcoming`                 | `upcoming` or `past`. Else `400 INVALID_WINDOW`              |

```json
{
  "games": [{ "…": "game card" }],
  "pagination": { "page": 1, "limit": 12, "totalDocs": 30, "totalPages": 3, "hasNextPage": true }
}
```

**Pagination** is page-based: "Daha çox" requests `page + 1` and appends; hide it when `hasNextPage` is `false`. `totalDocs`/`totalPages` reflect the filters.

## `GET /api/v1/games/featured`

Hero-carousel games: game cards plus a participant preview for the avatar stack.

| Query   | Default | Notes    |
| ------- | ------- | -------- |
| `city`  | `baku`  | As above |
| `limit` | `8`     | 1–8      |

**Ranking.** Candidates are `open` games starting within the next 7 days, each scored

```
score = 0.6 × (1 − hoursUntilStart / 168) + 0.4 × (currentCount / maxCount)
```

so games that start soon and are nearly full rank first. Ties go to the earlier start.

```json
{
  "games": [
    {
      "…": "game card",
      "participants": {
        "preview": [{ "id": "7", "name": "Elvin Abbasov", "initials": "EA", "avatarUrl": "/api/media/file/elvin.png" }],
        "total": 11
      }
    }
  ],
  "totalDocs": 1
}
```

`preview` holds up to the first 5 players who joined through the join endpoint, oldest first. Show `avatarUrl` when set, else `initials`. The "+N" bubble is `total − preview.length`. Each player is named after their account (the name typed into the join form only stands in once the account is gone, when `id` is `null`). The whole avatar row opens the full list, [`GET /api/v1/games/{id}/participants`](#get-apiv1gamesidparticipants).

## `GET /api/v1/games/{id}`

"Oyun Detalı". Signing in is optional.

```json
{
  "…": "game card",
  "host": { "id": "4", "name": "Elvin Abbasov", "initials": "EA", "avatarUrl": null, "phone": null },
  "participants": { "preview": [{ "id": "9", "name": "…", "initials": "RM", "avatarUrl": null }], "total": 11 },
  "viewer": { "joined": false, "isHost": false },
  "freeBySide": { "home": 2, "away": 3 },
  "hostSide": "home",
  "result": { "homeScore": 3, "awayScore": 1, "status": "reported" },
  "canReport": false,
  "canConfirm": true
}
```

`result` is the game's score, `null` until the host reports one. `status` is `reported` (waiting for
the other side), `confirmed` (final) or `disputed` (the host must report again); a report left
unanswered for 48 hours reads as `confirmed`. `canReport` and `canConfirm` are what this viewer may
do now, decided by the same rules the [score routes](#post-apiv1gamesidresult) enforce, so a page
never re-derives them.

`freeBySide` is the free spots on each half of the game ("A komandası" is `home`, "B komandası" is
`away`), for the join modal's side picker. Each side holds half of `maxCount`; the host's guests
stand with the host until that side is full.

`host.phone` is `null` until the viewer has joined (or is the host), matching "Əlaqə oyuna qoşulduqdan sonra görünür". The button reads "Qoşul - {remainingSpots} yer qalıb" while `status` is `open`. `404 GAME_NOT_FOUND` for unknown IDs.

## `GET /api/v1/games/{id}/participants`

"İştirakçılar": the list the avatar row opens, on the game page and the home carousel. Public, like
the game itself; signing in only marks your own row. Read fresh on every request, so it shows a join
from a second ago.

```json
{
  "game": { "id": "12", "title": "Cümə axşamı 5-ə-5", "currentCount": 11, "maxCount": 12 },
  "host": { "id": "4", "name": "Elvin Abbasov", "initials": "EA", "avatarUrl": null, "side": "home", "you": false },
  "players": [
    { "id": "7", "name": "Aysel Quliyeva", "initials": "AQ", "avatarUrl": "/api/media/file/aysel.png", "side": "away", "you": true },
    { "id": null, "name": "Rəşad Babayev", "initials": "RB", "avatarUrl": null, "side": "home", "you": false }
  ],
  "others": 2,
  "canMove": false,
  "sideNames": { "home": "Qarabağ Veteranlar", "away": null }
}
```

- `sideNames` is the name of each side's club, `null` for an open side ("A komandası" and "B komandası").
- `canMove` is `true` only for the host of a game that hasn't started: the page then shows the move
  buttons and "Balansla" ([`PATCH /sides`](#patch-apiv1gamesidsides)).
- `side` is the half of the game each player is on; the page lists the two sides as columns.
- The host comes first, then the players in the order they joined. Each row links to
  `/users/{id}`, and the viewer's own (`you`) to `/profile`.
- Names are the accounts' names, like the avatar row. `id` is `null` for a player whose account is
  gone: that row shows the name typed into the join form and links nowhere.
- `others` is the rest of `currentCount`: players the host said were already coming when they
  created the game, who have no account to list ("+2 nəfər hostla birlikdə gəlir").
- No phone numbers. `404 GAME_NOT_FOUND`, `400 INVALID_GAME_ID`.

## `POST /api/v1/games/{id}/result`

"Hesabı daxil et". The host (or an admin) reports the score once the game is over. Body:
`{ "homeScore": 3, "awayScore": 1 }`, both whole numbers from 0 to 300 ("A komandası" is home). It
answers `{ "game": … }`, the same body as the game detail.

- The score then waits for a player on the other side from the host to confirm or dispute it
  ([`POST /result/confirm`](#post-apiv1gamesidresultconfirm)). Reporting again, after a dispute or to
  correct a typo, starts the 48-hour clock over and clears the earlier answer.
- A confirmed score is final, and so is one nobody answered for 48 hours: `409 RESULT_LOCKED`. An
  admin can still change it, and an admin's report is confirmed at once.
- Errors: `400 INVALID_RESULT`, `400 INVALID_GAME_ID`, `401 UNAUTHENTICATED`, `403 NOT_GAME_HOST`,
  `404 GAME_NOT_FOUND`, `409 GAME_NOT_FINISHED` (the game hasn't ended, or was cancelled).

## `POST /api/v1/games/{id}/result/confirm`

"Təsdiqlə" / "Etiraz et". A signed-in player who stands on the other side from the host answers the
reported score. Body: `{ "action": "confirm" }` or `{ "action": "dispute" }`. Answers
`{ "game": … }`.

- Errors: `400 INVALID_ACTION`, `401 UNAUTHENTICATED`, `403 FORBIDDEN` (not a player on the other
  side: the host's own teammates, strangers and the host can't answer), `404 GAME_NOT_FOUND`,
  `409 NOTHING_TO_CONFIRM` (no score reported, or it is already confirmed or disputed),
  `409 GAME_NOT_FINISHED`.

## `PATCH /api/v1/games/{id}/sides`

"Komandaları dəyiş": the host moves players between the two sides, or presses "Balansla". Host or
admin only, and only before kick-off. Everything runs in one transaction under the game's row lock,
so a join racing it waits, and a request that would break a rule changes nothing.

Move players (at most one move per player, up to 22):

```json
{ "assignments": [{ "userId": 7, "side": "away" }] }
```

Or balance everyone:

```json
{ "balance": true }
```

- Balancing makes the sides equal in size first, then in strength (each player's confirmed record,
  a newcomer counting as 0.5). The host stays where they are and their guests with them. Members of
  a club stay on its side.
- `200` answers with the same body as [`GET /participants`](#get-apiv1gamesidparticipants), so the
  page can redraw the list.
- Errors: `400 INVALID_SIDES` (bad body), `401 UNAUTHENTICATED`, `403 NOT_GAME_HOST`,
  `404 GAME_NOT_FOUND`, `409 GAME_STARTED`, `409 NOT_IN_GAME` (a player who isn't in the game),
  `409 NOT_A_MEMBER` (a club's side is for its members), `409 SIDE_FULL` (a side would hold more
  than half the game, guests included).

## `PATCH /api/v1/games/{id}`

"Oyunu redaktə et". **Host only** (admins too); everyone else gets `403`.

Body is the create-game form minus `currentCount`: `sport`, `level`, `venueId`, `scheduledDate`,
`scheduledTime`, `maxCount`, `hostPhone`, an optional `title` and the optional `homeTeamId` and
`awayTeamId`. Like every field, the clubs are replaced by what the form sends: leaving them out
clears them. Who is in the game is decided by
who joined, not by the host editing a number, so `currentCount` is ignored if sent — only the free
spots move when `maxCount` changes.

**200** returns `{ "game": { … } }`, the same shape as `GET /api/v1/games/{id}`.

| Status | `code`                    | When                                                         |
| ------ | ------------------------- | ------------------------------------------------------------ |
| 400    | `MAX_COUNT_BELOW_PLAYERS` | `maxCount` is lower than the players already in the game     |
| 400    | `INVALID_MAX_COUNT`       | Not even, or past the sport's limit (e.g. 10 players, tennis)|
| 400    | `DATE_IN_PAST`            | The new start time has already passed                        |
| 400    | `VENUE_SPORT_MISMATCH`    | The venue does not host the chosen sport                      |
| 401    | `UNAUTHENTICATED`         | Not signed in                                                 |
| 403    | `NOT_GAME_HOST`           | Signed in, but not this game's host                           |
| 404    | `GAME_NOT_FOUND`          |                                                               |
| 409    | `GAME_STARTED`            | The game has started (admins too: they correct it in `/admin`) |
| 409    | `SIDE_FULL`               | The new `maxCount` leaves a side with more players than half  |
| 409    | `NOT_A_MEMBER`            | A chosen club's side holds a player who isn't a member: the host moves them first |
| 400    | `TEAM_NOT_FOUND`, `TEAM_SPORT_MISMATCH`, `SAME_TEAM`, `INVALID_TEAM` | A club that doesn't exist, plays another sport, is on both sides, or isn't an id |

## `DELETE /api/v1/games/{id}`

"Oyunu sil". **Host only** (admins too), and for the host only until the game starts: after that it
is in its players' past games and stats, so only an admin can delete it (`409 GAME_STARTED`). Deletes the game and every participant row pointing at it —
the foreign key is `ON DELETE SET NULL`, so the participants have to be removed explicitly or they
are left orphaned and keep turning up in counts. Both happen in one transaction.

Join attempts are kept: `join_attempts.gameId` is a plain number, so the audit log survives the game.

**200** returns `{ "ok": true, "id": "12" }`. Errors are the `401` / `403` / `404` / `409` rows above.

## `POST /api/v1/games/{id}/join`

"Oyuna qoşul". Requires a signed-in user (Payload session or Google session cookie).

Body: `{ "name": "Kərim Məmmədov", "phone": "+994 50 210 34 56" }` — what step 1 of the join modal collected. Both are re-validated server-side; either one left out falls back to the profile's value, and a `400` follows if the profile has none.

`side` is optional: `"home"`, `"away"` or `"random"` (the default). Random takes the emptier side,
with a coin flip on a tie. A side that belongs to a club only admits its members.

A `phone` sent is kept on the profile (see [Remembered phone number](#remembered-phone-number)) when the profile has none, or when `"saveToProfile": true` asks to replace it.

**200** also returns the full game detail, now with `host.phone`:

```json
{
  "id": "12",
  "status": "full",
  "remainingSpots": 0,
  "currentCount": 12,
  "maxCount": 12,
  "side": "away",
  "game": { "…": "as GET /api/v1/games/{id}", "host": { "name": "Elvin Abbasov", "phone": "+994502103456" } },
  "savedToProfile": false
}
```

The spot is taken when this request succeeds. The "Bir addım qaldı" modal then closes and the page reloads its data, which shows the new count and the host's phone.

| Status | `code`              | When                                                      |
| ------ | ------------------- | --------------------------------------------------------- |
| 400    | `INVALID_GAME_ID`   | `id` is not a positive integer                            |
| 400    | `INVALID_NAME`      | No name given and the profile has none                    |
| 400    | `INVALID_PHONE`     | `phone` isn't an Azerbaijani number, or none is known     |
| 400    | `INVALID_SIDE`      | `side` is something other than home, away or random       |
| 401    | `UNAUTHENTICATED`   | Not signed in: send the user to "Daxil ol"                |
| 404    | `GAME_NOT_FOUND`    |                                                           |
| 409    | `GAME_FULL`         | No spots left, including losing a race for the last spot  |
| 409    | `GAME_NOT_JOINABLE` | Cancelled, finished, live, or already started             |
| 409    | `ALREADY_JOINED`    | This user already holds a spot                            |
| 409    | `SIDE_FULL`         | The chosen side is full (the other may still have room)   |
| 409    | `NOT_A_MEMBER`      | The chosen side is a club's, and this user isn't in it    |
| 429    | `RATE_LIMITED`      | 10 join or leave requests in the last minute (user or IP) |

**Concurrency.** The spot is claimed with one conditional `UPDATE … WHERE available_players > 0` inside a transaction (`lib/join-game.ts`). Postgres re-checks the condition after the row lock is released, so when two requests race for the last spot, exactly one succeeds and the other gets `409 GAME_FULL`, across any number of app instances. A unique `(game, user)` index prevents double joins, and a rejected join rolls the decrement back. The side is picked under the same row lock, so two joins can't both take a side's last spot. Every attempt is written to the `join-attempts` collection (outcome, game, user, IP), readable by admins.

## `GET /api/v1/venues`

Options for the "Meydança" picker.

| Query   | Default | Notes                                                   |
| ------- | ------- | ------------------------------------------------------- |
| `city`  | `baku`  | As above                                                |
| `sport` | all     | Venues offering that sport (venues with no sports set are always included) |
| `q`     | none    | Search in name, district and address; ignores case and Azerbaijani letters (`inter`, `nerimanov`) |

```json
[{ "id": "3", "name": "Aku Arena", "label": "Aku Arena — Nizami, Bakı", "district": "Nizami", "…": "as venue above" }]
```

## `POST /api/v1/games`

"Yeni Oyun Yarat" → "Oyunu dərc et". Requires a signed-in user, who becomes the host and, in the same transaction, the game's first participant.

```json
{
  "sport": "Futbol",
  "level": "Orta",
  "venueId": 3,
  "scheduledDate": "2026-08-04",
  "scheduledTime": "17:00",
  "currentCount": 1,
  "maxCount": 10,
  "hostPhone": "+994 50 210 34 56",
  "title": "Cümə axşamı 5-ə-5"
}
```

| Field           | Notes                                                                      |
| --------------- | -------------------------------------------------------------------------- |
| `sport`         | `football`/`basketball`/`tennis` or the labels `Futbol`/`Basketbol`/`Tennis` |
| `level`         | `beginner`/`medium`/`high` or `Başlanğıc`/`Orta`/`Yüksək`                  |
| `venueId`       | From `GET /api/v1/venues`                                                  |
| `scheduledDate`, `scheduledTime` | Baku local time, `YYYY-MM-DD` and `HH:mm`; must be in the future |
| `currentCount`  | "Mövcud iştirakçı sayı": players already in, including the host, `1 … maxCount − 1` (0 or missing counts as 1). The game opens with `maxCount − currentCount` spots |
| `maxCount`      | Even (two equal sides), from 2 up to the sport's full size: football 22, basketball 10, tennis 4 |
| `hostPhone`     | Optional if the profile has a phone number; shown to players after they join |
| `title`         | Optional, defaults to "Futbol oyunu" etc. (the design has no title field)  |
| `homeTeamId`, `awayTeamId` | Optional club ids, one per side ("Komandalar"); absent, `null` or `""` leaves the side open to anyone. The club on the host's own side must be one the host is in. Both must play the game's sport, and not be the same club. A side with a club admits only its members |
| `hostSide` | Optional `home` (default) or `away`: the side the host stands on, where their `currentCount − 1` guests stand too until it is full. Create only: an edit ignores it, and the host moves like any player (`PATCH /sides`) |
| `saveToProfile` | Optional `true`: also replace the profile's number with `hostPhone` (see [Remembered phone number](#remembered-phone-number)) |

The host name ("Ad Soyad (Host)") comes from the account, so show it read-only.

**201** `{ "game": { …as GET /api/v1/games/{id} }, "savedToProfile": true }`. Errors: `401 UNAUTHENTICATED`; `400` with `INVALID_SPORT`, `INVALID_LEVEL`, `INVALID_VENUE`, `INVALID_DATE`, `DATE_IN_PAST`, `INVALID_MAX_COUNT`, `INVALID_CURRENT_COUNT`, `INVALID_PHONE`, `VENUE_NOT_FOUND`, `VENUE_SPORT_MISMATCH`, `PHONE_REQUIRED`, `INVALID_TEAM`, `TEAM_NOT_FOUND`, `TEAM_SPORT_MISMATCH`, `SAME_TEAM`, `INVALID_SIDE`; `409 NOT_A_MEMBER` (the host isn't in the club of their own side).

### Remembered phone number

The create form and the join modal start from the profile's number, so the number someone types is
kept there for next time: after a successful create or join, the `hostPhone` / `phone` sent becomes
the profile's number **when the profile has none**. A different number already on the profile is
only replaced when the body carries `"saveToProfile": true` (the forms' "Bu nömrəni profilimdə
saxla" checkbox). A number another account holds is never taken — numbers are unique per account —
and a failure here never fails the create or join. `savedToProfile` in the response says whether the
profile changed; the client then calls the `expireSession` Server Action so the header and the next
form don't keep showing the session it had cached.

## `POST /api/v1/games/{id}/leave`

"Oyundan çıx", on the game page and on the profile's "Qoşulduğum · Qarşıdakı" cards. Requires a
signed-in user and hands the spot back to the game. Allowed right up to kick-off. The host cannot
leave their own game — they delete it instead.

The participant row is deleted first, and the spot only returned when that DELETE actually removed
something, so calling this repeatedly cannot push `available_players` past `max_players` and invent
places in a full game. Response body matches the join endpoint.

| Status | `code`              | When                                                  |
| ------ | ------------------- | ----------------------------------------------------- |
| 401    | `UNAUTHENTICATED`   | Not signed in                                         |
| 404    | `GAME_NOT_FOUND`    |                                                       |
| 409    | `NOT_JOINED`        | Not in this game (also a second leave)                |
| 409    | `HOST_CANNOT_LEAVE` | The host leaves by deleting the game                  |
| 409    | `GAME_STARTED`      | Already kicked off, cancelled or finished             |
| 429    | `RATE_LIMITED`      | As for join; joins and leaves share the count         |

## Clubs

A club is a named team with one sport, a captain and members. Anyone signed in can create one and
becomes its captain; others join through the captain's invite link. Clubs with no members are hidden
from the list but stay readable, because past games point at them.

### `GET /api/v1/teams`

"Komandalar". Public. `?sport=football|basketball|tennis` narrows it (`400 INVALID_SPORT` otherwise).
Biggest club first.

```json
{
  "teams": [{
    "id": "7", "name": "Qarabağ Veteranlar", "sport": "football", "sportLabel": "Futbol", "memberCount": 9,
    "record": { "played": 3, "wins": 1, "draws": 1, "losses": 1, "winRate": 0.33, "scored": 4, "conceded": 4, "points": 4, "form": ["loss", "draw", "win"] }
  }],
  "standings": [{ "…": "the same clubs, as a league table" }]
}
```

`record` is the club's record from confirmed scores, over the games it was named in (home or away
club), whoever turned up. With `?sport=`, `standings` holds the same clubs in league order: points,
then goal difference, then goals scored, then the bigger club. Different sports can't share a table,
so without `?sport=` there is no `standings`.

### `POST /api/v1/teams`

"Komanda yarat". Body: `{ "name": "Qarabağ Veteranlar", "sport": "football" }`; the name is 2 to 40
characters. Answers `201 { "id": "7" }`. The creator is the captain and the first member.

- Errors: `400 INVALID_NAME`, `400 INVALID_SPORT`, `401 UNAUTHENTICATED`, `409 TOO_MANY_CLUBS` (a
  person captains at most 5).

### `GET /api/v1/teams/{id}`

A club's page. Public; signing in marks your own row.

```json
{
  "id": "7", "name": "Qarabağ Veteranlar", "sport": "football", "sportLabel": "Futbol", "memberCount": 2,
  "members": [{ "id": "4", "name": "Elvin Abbasov", "initials": "EA", "avatarUrl": null, "isCaptain": true, "you": false }],
  "record": { "…": "as in GET /api/v1/teams" },
  "recent": [{ "id": "31", "title": "Cümə axşamı 5-ə-5", "startsAt": "…", "dateLabel": "Cüm, 9 Okt", "homeScore": 3, "awayScore": 1, "outcome": "win", "opponent": "Neftçi" }],
  "viewer": { "isMember": false, "isCaptain": false },
  "inviteCode": null
}
```

`recent` is the club's latest five counted games, newest first: the score as `homeScore` : `awayScore`
(the game's A and B sides), the `outcome` from the club's side, and the other club's name (`null`
when that side was open).

Members are in the order they joined. `inviteCode` is only ever set for the captain: it is the whole
of what someone needs to join, and the link is `/teams/join/{inviteCode}`. `404 TEAM_NOT_FOUND`,
`400 INVALID_TEAM_ID`.

### `PATCH /api/v1/teams/{id}`

Captain only. `{ "name": "…" }` renames the club; `{ "regenerateInviteCode": true }` retires the old
link for a new one (the old code stops working at once). Both may be sent together. Answers the club,
as `GET` does. Errors: `400 INVALID_NAME`, `400 INVALID_TEAM`, `401`, `403 NOT_CAPTAIN`, `404`.

### `POST /api/v1/teams/{id}/join`

"Komandaya qoş". Body: `{ "code": "…" }`, the code from the invite link. Answers
`{ "joined": true, "team": … }`; joining a club you are already in does nothing (`joined: false`).
Errors: `401`, `403 INVALID_INVITE` (wrong or retired code, or a club that has no code yet), `404`.

### `POST /api/v1/teams/{id}/leave`

"Komandadan çıx". A leaving captain hands the club to its longest-standing member; when the last
member leaves the club is kept with no captain. Games the person already joined on the club's side
stay as they are. Errors: `401`, `404`, `409 NOT_A_CLUB_MEMBER`.

### `DELETE /api/v1/teams/{id}/members/{userId}`

"Üzvü çıxar". The captain removes a member, with the same hand-over if it is themselves. Errors:
`401`, `403 NOT_CAPTAIN`, `404`, `409 NOT_A_CLUB_MEMBER`.

Deleting an account hands over every club that person captains, the same way.

## Profile

### `GET /api/v1/me`

The signed-in user's profile in one request. Use this rather than Payload's `/api/users/me`, which
also hands the client `role`, `googleId`, `loginAttempts` and `lockUntil`.

```json
{
  "id": "12", "fullName": "Kərim Məmmədov", "firstName": "Kərim", "initials": "KM",
  "email": "k@example.com", "phoneNumber": "+994502103456",
  "avatarUrl": "…", "hasUploadedPicture": true, "googleAvatarUrl": "https://lh3.googleusercontent.com/…",
  "memberSince": "2026-02-11T09:12:00.000Z", "memberSinceLabel": "fevral 2026",
  "counts": { "hostingUpcoming": 2, "hostedPast": 7, "joinedUpcoming": 1, "played": 14 },
  "stats": {
    "totalPlayed": 21,
    "playedBySport": [{ "sport": "football", "label": "Futbol", "iconKey": "football", "playedCount": 9 }]
  },
  "record": {
    "played": 3, "wins": 1, "draws": 1, "losses": 1, "winRate": 0.33, "scored": 4, "conceded": 4,
    "points": 4, "form": ["loss", "draw", "win"],
    "bySport": [{ "sport": "football", "played": 3, "wins": 1, "draws": 1, "losses": 1, "winRate": 0.33, "scored": 4, "conceded": 4, "points": 4, "form": ["loss", "draw", "win"] }]
  },
  "clubs": [{ "id": "7", "name": "Qarabağ Veteranlar", "sport": "football", "sportLabel": "Futbol" }]
}
```

- `record` is the win/draw/loss record from games with a **confirmed score**, with the side the person
  stood on in each: `winRate` is 0–1, `points` is 3 a win and 1 a draw, `form` the last five outcomes
  newest first, `bySport` the same per sport (every sport present, even with no games). A game whose
  score nobody confirmed is in `stats` as played but has no result to add here; a score left
  unanswered for 48 hours counts as confirmed, and a cancelled game never counts.
- `clubs` are the clubs the person is in, by name.

- `hostingUpcoming` / `joinedUpcoming` match the upcoming lists of `GET /api/v1/me/games`.
- `hostedPast` and `played` are games that are over and were not cancelled: hosted ones, and joined
  ones the user did not host. A game is counted in exactly one of them.
- `stats.playedBySport` counts both, per sport, so it adds up to `stats.totalPlayed` =
  `played + hostedPast`.
- `memberSinceLabel` is the Baku calendar month the account was created, for "Qeydiyyat: fevral 2026".
- `avatarUrl` is the uploaded picture if there is one (`hasUploadedPicture`), else the Google picture
  saved at sign-in (`googleAvatarUrl`), else `null` (show `initials`).

### `PATCH /api/v1/me`

Body may carry any of `fullName`, `phone`, `profilePictureId`, `emailNotifications` (boolean: emails
about games this user joined, on by default; else `400 INVALID_NOTIFICATIONS`); only the keys sent are changed, so a
patch never blanks a field it did not mention. `null` (or `""`) clears `phone` / `profilePictureId`.
Phones go through the same `normalizePhone` as everywhere else, so `055 987 65 43` is stored as
`+994559876543` and matches numbers saved by the join form.

`email`, `role` and `googleId` are not editable — they are what tie the account to its Google
identity. A body with only those comes back as `NOTHING_TO_UPDATE`.

**200** returns `{ "profile": { … } }`, as `GET /api/v1/me`.

| Status | `code`               | When                                        |
| ------ | -------------------- | ------------------------------------------- |
| 400    | `INVALID_NAME`       | Empty, or over 120 characters               |
| 400    | `INVALID_PHONE`      | Not an Azerbaijani number                   |
| 400    | `INVALID_MEDIA`      | `profilePictureId` is not a valid upload id |
| 400    | `MEDIA_NOT_FOUND`    | No such upload, or one this user did not upload |
| 400    | `NOTHING_TO_UPDATE`  | No editable field was sent                  |
| 409    | `PHONE_TAKEN`        | Another account already holds that number   |

Uploading the picture itself is Payload's `POST /api/media` (signed-in only, see [Uploads](#uploads));
send the returned id as `profilePictureId`. Only an upload of the user's own is accepted — a venue photo
or someone else's avatar gets `MEDIA_NOT_FOUND`, as if it did not exist. The picture it replaces (or
that `null` removes) is deleted, file and all, when this user uploaded it.

### `DELETE /api/v1/me`

Deletes the account, **and the upcoming games it hosts** (scheduled, not started yet), with their
participants: nobody would be left to run them. Games it hosted that have already started stay,
because they are part of the other players' history and stats: `games.host_id` is ON DELETE SET
NULL, so they are left with no host (shown under the default name, without a profile link), and
their contact number is cleared. This user's own participations go too. Each spot the user held in
someone else's upcoming game is handed back, as if they had left it; past games keep their numbers.
One transaction. The pictures the user uploaded are deleted after it commits (files can't be rolled
back); a kept game whose cover was one of them falls back to the venue or sport picture.

Returns `{ "ok": true, "deletedGames": 1 }`, the number of upcoming games deleted, and clears both
session cookies.

### `GET /api/v1/me/games`

The profile's game lists, in the same card shape as `GET /api/v1/games`.

| Query  | Default    | Notes                                                             |
| ------ | ---------- | ----------------------------------------------------------------- |
| `role` | `joined`   | `joined` or `hosting`. `joined` excludes games the viewer hosts   |
| `when` | `upcoming` | `upcoming` (soonest first) or `past` (most recent first)          |
| `page` | `1`        | 1-based                                                           |
| `limit`| `12`       | 1–50                                                              |

### `GET /api/v1/users/{id}`

Another player's public profile — open to anyone, because it carries only what a game card already
shows about its host, plus the games they are running. Never their email or phone: a host's number
stays gated behind joining the game (`GET /api/v1/games/{id}`).

```json
{
  "id": "12", "fullName": "Kərim Məmmədov", "firstName": "Kərim", "initials": "KM", "avatarUrl": "…",
  "memberSince": "…", "memberSinceLabel": "fevral 2026", "counts": { "hostingUpcoming": 2, "hostedPast": 7 },
  "hostedGames": [{ "…": "game card" }],
  "record": { "…": "as GET /api/v1/me" },
  "clubs": [{ "…": "as GET /api/v1/me" }]
}
```

`404 USER_NOT_FOUND` for an id that does not exist.

## Accounts

Payload's built-in auth endpoints on the `users` collection:

**Google is the only way in.** There is no email/password form and no separate sign-up screen: the
account is created on first Google sign-in. `POST /api/users` is admin-only, so nothing can register
an account another way.

| Screen              | Request                                                                                 |
| ------------------- | --------------------------------------------------------------------------------------- |
| Daxil ol            | Link to `/api/auth/google`. The callback verifies the code with Google server-side, requires a verified email, and creates the account on first sign-in (name, email, profile picture), then sets the `google_session` cookie |
| Current user        | `GET /api/users/me`                                                                     |
| Log out             | `POST /api/users/logout` (Payload session) **and** `POST /api/auth/logout` (Google session cookie) |

Users can only read and edit their own account. Payload's own email/password login stays enabled for
the `/admin` panel, but no public screen uses it.

## Unused surfaces

- The `teams` collection and the `homeTeam` / `awayTeam` / `homeScore` / `awayScore` fields on games
  are not read by any endpoint or screen; only `scripts/seed.ts` writes them.
- `game-participants` is no longer publicly readable: a user reads their own rows, admins read all.
  Everything the app renders from it (avatar stacks, counts, "my games") runs with `overrideAccess`,
  so this only closes the REST route that let anyone enumerate one person's games.
- GraphQL is disabled (`graphQL: { disable: true }`): `/api/v1` is the only data surface.

## Uploads

`POST /api/media` (multipart: `file`, plus `_payload` = `{"alt": "…"}`) is open to any signed-in user.

- **Types:** JPEG, PNG and WebP only (`400` otherwise). SVG is refused because it is a document that
  can carry script and would be served from the site's own origin.
- **Size:** at most 4 MB (`413`, "Şəkil 4 MB-dan böyük ola bilməz."), below Vercel's 4.5 MB request
  limit, which would otherwise answer with a bare error page.
- **Ownership:** the server records the uploader in `uploadedBy` and ignores any value sent. Only the
  uploader or an admin can `PATCH` or `DELETE /api/media/{id}`; everyone else gets `403`. Uploads from
  before `uploadedBy` existed (migration `20260925_065346_media_uploaded_by`) belong to nobody, so only
  admins can change them.

## Images

Uploads to `media` get `thumbnail` (480×270) and `full` (≤1600 wide) WebP renditions. Render them with `next/image`, which also serves AVIF to browsers that accept it. Set `MEDIA_BASE_URL` (a CDN in front of the app, or later an S3 bucket via `@payloadcms/storage-s3`) to get CDN URLs. A game's cover is resolved most-specific-first: its own uploaded `coverImage`, then its `image`
path, then **the venue's `image`** (so a game at a venue with a photo shows that place rather than
stock art), then the sport's default picture. `coverImage.fallbackUrl` stays the sport default, so a
venue photo that fails to load still degrades to something sensible.
