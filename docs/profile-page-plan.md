# Profile pages: design and task plan

The profile **backend already exists** (`lib/profile-queries.ts`, documented under "Profile" in
[api.md](api.md)): `GET/PATCH/DELETE /api/v1/me`, `GET /api/v1/me/games`, `GET /api/v1/users/{id}`.
This plan covers everything still needed to ship the feature: two pages, the edit and delete flows,
entry points, a few backend gaps, and one security fix that has to land before profile pictures can
be uploaded.

There is no Figma frame for these screens. The design below reuses layouts, classes and tokens that
already exist on other pages, so the profile pages look like they belong to the same site.

## Status

Phases 0–7 are implemented, one commit per phase. What is still open:

- **T7.3 copy review:** every new Azerbaijani string still needs a native speaker's read.
- **T4.5 skipped:** `next/cache` refuses to run outside Next, so a cached `getPublicProfile` would break
  the database tests that call it directly. It is two small queries, and `getGameDetail` isn't cached
  either.
- **Deploying:** run `npm run migrate` (migration `20260925_065346_media_uploaded_by`) before the new
  version serves traffic.

Where the build differs from the text below:

- On phones the identity panel stacks the 96px avatar above the name, instead of shrinking it to 72px.
- T2.8's component is called `AccountSection`, since it also holds the danger zone.
- Beyond the plan: replacing or removing a profile picture deletes the old upload, a deleted account's
  uploads are deleted too, and the profile returns `googleAvatarUrl` so the picture preview is right
  after "Şəkli sil".
- The "Oyundan çıx" announcement lives in `JoinPanel`, because the refresh after leaving unmounts the
  button that triggered it.

## Decisions taken

| Question | Decision |
| --- | --- |
| URLs | `/profile` (own, signed-in only) and `/users/[id]` (public), matching the English routes and the API paths |
| Profile picture upload | Last phase, after the media access fix (Phase 5). Until then the Google photo is shown, as today |
| Account deletion and spots in other people's games | Give the spot back for upcoming games (T1.8). Drop that task to keep today's behaviour |
| "Oyundan çıx" button | Included (Phase 6): the profile lists joined games, and there's no way to leave one today |
| Search engines | Public profiles get `noindex`: they show private individuals' names and photos |

## Before you start

- Read `AGENTS.md`. This is Next.js 16 with `cacheComponents: true`: a session read outside a
  `<Suspense>` boundary is a build error, `params`/`searchParams` are promises, and route protection
  lives in `proxy.ts` (not middleware). Relevant guides in `node_modules/next/dist/docs/01-app/`:
  `02-guides/authentication-with-cache-components.md`, `03-api-reference/01-directives/use-cache-private.md`,
  `03-api-reference/04-functions/redirect.md`.
- Every existing page follows the same shape: **a static shell** (back link and title) that renders instantly,
  and **request-dependent content behind `<Suspense>`** with a skeleton made from the real layout
  classes. Both new pages do the same.
- To sign in without Google while testing: `npm run seed`, then log in at `/admin` with any seed account
  (the seed script prints the password). The `payload-token` cookie is accepted by the site.

---

## 1. Design language reused

| Element | Taken from | Used for |
| --- | --- | --- |
| Page wrapper `container`, `padding-block: 32px 96px`, 44px between sections (24px/64px and 32px on phones) | `GamesSection.module.css` `.section` | Both pages: the games grid is the largest block, and `GameCard`'s `sizes` hint assumes this width |
| Back link (13px, muted, arrow nudges on hover) | `BackLink` + `.back` in `GameDetail.module.css` | Top of both pages |
| Page title 40px Space Grotesk (30px on phones) | `.pageTitle` / GameForm `.title` | "Profilim"; "Oyunçu profili" |
| Subtitle 16px muted | GameForm `.subtitle` | Under "Profilim" |
| Panel: white, 1px `--color-primary-border`, 14px radius, 24px padding, 16px gap; 14px uppercase muted label | `GameDetail.module.css` `.panel`, `.panelLabel` | Identity, stats and account panels |
| Two columns `701fr / 495fr`, collapsing at 859px | `GameDetail.module.css` `.layout` | Identity panel beside stats panel |
| Big number: 30px display, bold | `.headlineCount` | Stat tiles |
| Section heading 28px (23px on phones) | `GamesSection.module.css` `.title` | "Mənim oyunlarım", "Təşkil etdiyi oyunlar" |
| Card tabs with active inset ring, optimistic highlight, dimmed list while loading | `SportTabs` | "Qoşulduğum / Təşkil etdiyim" |
| 40px segmented control, active segment filled primary | GameForm `.levelChoice` | "Qarşıdakı / Keçmiş" |
| Card grid 3 → 2 → 1 columns, "Daha çox" / "Az göstər" | `GamesGrid` | Game lists |
| Empty illustration, heading, text, CTA | `EmptyState` | Empty tabs |
| Danger zone (red tint panel) + confirm modal, focus starts on "İmtina et" | GameForm edit mode | "Hesabı sil" |
| Modal on `<dialog>`, form fields, `+994` phone prefix | `Modal`, `form.module.css`, `JoinPanel` | Edit profile |
| `Avatar`, `ProgressBar`, sport icon (`SportIcon`) | `components/games/bits.tsx`, `sports.ts` | Identity, stats |
| `.reveal` stagger / `.fade` | `globals.css` | Content arriving after the skeleton |

No new colours or tokens. All new CSS goes in `components/profile/Profile.module.css`, which reuses
the values above. Classes shared as they are (panel, back link, tabs) are imported from their
existing modules, as `skeletons.tsx` already does.

---

## 2. `/profile`: own profile

### Desktop (≥ 860px)

```
← Geri qayıt
Profilim                                                         h1 · 40px
Hesab məlumatlarınız, statistikanız və oyunlarınız.              subtitle

┌─ identity panel ──────────────────────────────┐ ┌─ stats panel ─────────────────────────┐
│ ╭────╮  Kərim Məmmədov              h2 · 28px │ │ STATİSTİKA                     h2     │
│ │ KM │  k@example.com                         │ │   16           9            3         │
│ │ 96 │  +994 50 210 34 56                     │ │   oynanılan    təşkil       qarşıdakı │
│ ╰────╯  📅 Qeydiyyat: fevral 2026             │ │   oyun         edilən oyun  oyun      │
│                                               │ │ ───────────────────────────────────── │
│         [ Profili redaktə et ]                │ │ ⚽ Futbol     ███████████░░░░░   11    │
│                                               │ │ 🎾 Tennis     ███░░░░░░░░░░░░░    3    │
└───────────────────────────────────────────────┘ │ 🏀 Basketbol  ██░░░░░░░░░░░░░░    2    │
                    701fr                         └───────────────────────────────────────┘
                                                                 495fr
Mənim oyunlarım                                                  h2 · 28px
┌──────────────────────────────┐ ┌──────────────────────────────┐
│      Qoşulduğum oyunlar      │ │    Təşkil etdiyim oyunlar    │  card tabs, 2 columns
│      1 qarşıdakı oyun        │ │    2 qarşıdakı oyun          │
└──────────────────────────────┘ └──────────────────────────────┘
[ Qarşıdakı | Keçmiş ]                                           segmented, 40px

┌ GameCard ┐ ┌ GameCard ┐ ┌ GameCard ┐                            6 per page
┌ GameCard ┐ ┌ GameCard ┐ ┌ GameCard ┐
                 [ Daha çox ]

┌─ HESAB ─────────────────────────────────────────────────────────────────────────────────┐
│ Google hesabı ilə daxil olmusunuz: k@example.com                              [ Çıxış ]  │
└─────────────────────────────────────────────────────────────────────────────────────────┘
┌─ danger zone ───────────────────────────────────────────────────────────────────────────┐
│ Hesabı sil                                                                               │
│ Hesabınız birdəfəlik silinir. Təşkil etdiyiniz 9 oyun da silinir və …                    │
│ [ Hesabı sil ]                                                                           │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

### Narrower screens

- **< 860px:** identity and stats stack (identity first). Tabs stay two columns (10px gap, as
  `SportTabs`), the grid drops to one column.
- **< 600px:** page padding 24px/64px, title 30px, avatar 72px, stat numbers 26px. The avatar stays
  left of the name. The "Hesab" row wraps so "Çıxış" goes under the text, and the danger button
  becomes full width (existing `.dangerButton` rule).

### Sections

**Identity panel.** `Avatar` (96px, 72px on phones, brand colour behind initials). Name is an `h2`
(28px display, `overflow-wrap: anywhere`). Email is 14px muted. The phone uses `formatPhone()`, or
reads "Telefon nömrəsi əlavə edilməyib" with an inline "Əlavə et" button that opens the edit modal
with the phone field focused (Phase 3). "Qeydiyyat: {memberSinceLabel}" has the `calendar` icon.
"Profili redaktə et" is `buttonClass('outlinePrimary', 'md')` (Phase 3).

**Stats panel.** Label "Statistika" (`h2` styled as `.panelLabel`). Three tiles:

| Tile | Value | Label |
| --- | --- | --- |
| Played | `stats.totalPlayed` (T1.3) | "oynanılan oyun" |
| Hosted | `counts.hostedPast + counts.hostingUpcoming` | "təşkil edilən oyun" |
| Upcoming | `counts.joinedUpcoming + counts.hostingUpcoming` | "qarşıdakı oyun" |

Below a hairline divider is one row per sport, in `SPORT_ORDER`: sport icon, label (14px/600), a
`ProgressBar` (`value = playedCount`, `max = totalPlayed`, 8px), and the count right-aligned. With
nothing played yet, the rows are replaced by muted text: "Hələ heç bir oyunda iştirak etməmisiniz."

**Mənim oyunlarım.** `h2`, then two controls. Both are links that set query parameters, following
`SportTabs`: optimistic highlight, `router.replace(href, { scroll: false })`, and `data-pending` to
dim the grid while the next list loads.

- Role tabs: `?games=joined` (default) / `?games=hosting`. Label plus a count line:
  "{counts.joinedUpcoming} qarşıdakı oyun" / "{counts.hostingUpcoming} qarşıdakı oyun".
- Time segments: `?when=upcoming` (default) / `?when=past`.

The grid is `GamesGrid` against `/api/v1/me/games`, 6 per page, remounted with
`key={`${role}-${when}`}`. Card actions depend on the tab (T1.6):

| Tab | Card action |
| --- | --- |
| Joined · upcoming | "Oyuna bax" (outline link to the game). Never "Qoşul": the viewer is already in |
| Hosting · upcoming | "Redaktə et" → `/games/{id}/edit` while the game is open or full, else "Oyuna bax" |
| Either · past | No button: a muted "Keçmiş oyun" chip. Progress shows "{current}/{max} oyunçu" without "yer qalıb" |

Empty states (`EmptyState`, `h3`):

| Tab | Title | Text | CTA |
| --- | --- | --- | --- |
| Joined · upcoming | Qarşıda oyununuz yoxdur | Açıq oyunlara baxın və bəyəndiyiniz oyuna qoşulun. | Açıq oyunlara bax → `/games` |
| Joined · past | Hələ oyuna qoşulmamısınız | Açıq oyunlara baxın və bəyəndiyiniz oyuna qoşulun. | Açıq oyunlara bax → `/games` |
| Hosting · upcoming | Qarşıda təşkil etdiyiniz oyun yoxdur | Oyun yaradın, digər oyunçular sizə qoşulsun. | Oyun yarat → `/games/new` |
| Hosting · past | Hələ oyun təşkil etməmisiniz | Oyun yaradın, digər oyunçular sizə qoşulsun. | Oyun yarat → `/games/new` |

**Hesab panel.** "Google hesabı ilə daxil olmusunuz: {email}" and the existing `LogoutButton`
(`outlineDark`, `md`). This matters on phones, where the header's account controls are in the menu.

**Danger zone.** See §4.

### Rendering

```
ProfilePage (static shell: BackLink, h1, subtitle)
└─ <Suspense fallback={<ProfileSkeleton />}>
   └─ ProfileContent (async)
      ├─ getCurrentUser() → none: redirect(loginHref('/profile?…'))
      ├─ parseProfileTabs(await searchParams)
      ├─ Promise.all([getMyProfile(id), findMyGames(id, { role, when, page: 1, limit: 6 })])
      │    profile null (account deleted, cookie left over) → redirect to login
      ├─ ProfileIdentity (server) + EditProfileButton (client)
      ├─ ProfileStats (server)
      ├─ ProfileGames (server) → ProfileTabs (client) + GamesGrid (client) | EmptyState
      ├─ AccountPanel (server, LogoutButton)
      └─ DeleteAccount (client)
```

The data functions are called directly, as `games/[id]/page.tsx` calls `getGameDetail`: no fetch to
our own API during render. Profile data is not cached (it is per viewer, see the note at the top of
`lib/profile-queries.ts`).

---

## 3. Edit profile modal

Opened by "Profili redaktə et" (and by "Əlavə et" next to a missing phone). Built on `Modal`.

```
┌──────────────────────────────────────────────┐
│                                          [×] │
│ Profili redaktə et                           │
│ Adınız oyun kartlarında görünür.             │
│ ──────────────────────────────────────────── │
│ (Phase 5) ╭────╮ [ Şəkli dəyiş ]  Şəkli sil  │
│           │ KM │ JPG, PNG və ya WebP, 4 MB   │
│           ╰────╯                             │
│ Ad Soyad                                     │
│ [ Kərim Məmmədov                          ]  │
│ Telefon nömrəsi (istəyə bağlı)               │
│ [ +994 │ 50 210 34 56                     ]  │
│ Oyun yaradanda və qoşulanda avtomatik        │
│ doldurulur. Mövcud oyunlardakı nömrə dəyişmir│
│ E-poçt                                       │
│ [ k@example.com                (read-only) ] │
│ Google hesabınıza bağlıdır, dəyişdirilə bilməz│
│                                              │
│ [          Yadda saxla  (primary xl)       ] │
└──────────────────────────────────────────────┘
```

- **Fields:** name (`maxLength` 120, `autoComplete="name"`, `data-autofocus`), phone (shared
  `PhoneInput`, T1.9; may be empty), email (`readonly` input, which `form.module.css` already styles).
- **Client validation** before sending, same as `JoinPanel`: empty name → "Ad və soyadınızı daxil edin.";
  phone neither empty nor valid (`normalizePhone`) → `PHONE_ERROR`. Focus the first invalid field.
- **Request:** `PATCH /api/v1/me` with only the fields that changed. An emptied phone sends
  `phone: null`. "Yadda saxla" is disabled until something differs from the saved values.
- **Server errors → fields**, a table like GameForm's `API_ERRORS`: `INVALID_NAME` → name;
  `INVALID_PHONE`, `PHONE_TAKEN` → phone (the server message is already Azerbaijani);
  `UNAUTHENTICATED` → `/login?next=/profile`; anything else → `form.alert`.
- **Success:** close the modal, then `router.refresh()` inside `startTransition` (as `JoinPanel` does).
  A visually hidden `role="status"` announces "Profil yeniləndi".
- **Header freshness:** `getCurrentUser()` is `use cache: private`, cached in the browser. Check
  that the header chip shows the new name after the refresh. If it doesn't, finish with a full reload
  instead and say why in a comment, as `LogoutButton` does (T3.2).

---

## 4. Delete account

Danger zone at the bottom of `/profile`, the same component and styles as "Oyunu sil".

- **Panel copy:** "Hesabı sil". With hosted games: "Hesabınız birdəfəlik silinir. Təşkil etdiyiniz {n}
  oyun da silinir və həmin oyunlara qoşulan oyunçular yerini itirir. Bu əməliyyat geri qaytarıla bilməz."
  With none: "Hesabınız və bütün qoşulmalarınız birdəfəlik silinir. Bu əməliyyat geri qaytarıla bilməz."
  Here `n = counts.hostingUpcoming + counts.hostedPast`.
- **Confirm modal:** "Hesabı silmək istəyirsiniz?", the same text, then "İmtina et" (`muted`, focused
  first) and "Bəli, hesabı sil" (`danger`; "Silinir…" while pending).
- **Request:** `DELETE /api/v1/me`. The route clears both session cookies.
- **Success:** `window.location.assign('/')`, a full load for the same reason as logout: it drops
  the browser-cached session and prefetched signed-in pages.
- **Failure:** the message goes in the modal (`form.alert`), with "Hesabı silmək mümkün olmadı." as fallback.

---

## 5. `/users/[id]`: public profile

Open to everyone; not in `proxy.ts`. Shows only what `getPublicProfile` returns: never email or phone.

```
← Geri qayıt
Oyunçu profili                                  <p class=pageTitle>, like "Oyun Detalı"

┌─ identity panel ─────────────────────────────┐ ┌─ stats panel ──────────────────┐
│ ╭────╮  Elvin Abbasov               h1       │ │ TƏŞKİLATÇI                      │
│ │ EA │  📅 Qeydiyyat: mart 2026              │ │   2              7              │
│ ╰────╯                                       │ │   qarşıdakı      keçirilmiş     │
└──────────────────────────────────────────────┘ │   oyun           oyun           │
                                                 └─────────────────────────────────┘
ⓘ Bu sizin ictimai profilinizdir.  Profilimə keç →      only when viewing yourself

Təşkil etdiyi oyunlar                           h2 · 28px
┌ GameCard ┐ ┌ GameCard ┐ ┌ GameCard ┐           up to 20, no paging
```

- The static shell has the back link (fallback `/games`) and "Oyunçu profili". The name is the `h1` in the
  identity panel, the same split as the game page ("Oyun Detalı" static, game title as `h1`).
- A `cache()`-wrapped loader is shared by `generateMetadata` and the content, as in
  `games/[id]/page.tsx`. Metadata: `title: fullName`, `robots: { index: false }`.
- A malformed or unknown id → `notFound()`.
- Games: a plain `<ul className={grid.grid}>` of `GameCard` (default "browse" context, so visitors can
  join). `getPublicProfile` returns at most 20 unpaginated, so `GamesGrid` isn't needed.
- Empty: "Hazırda açıq oyunu yoxdur" / "{firstName} yeni oyun yaradanda burada görünəcək." →
  "Açıq oyunlara bax".
- The "your own profile" notice is in its own `<Suspense fallback={null}>`, so the session lookup
  never holds up the page.

---

## 6. Entry points

- **Header** (`components/site/Header.tsx`): the avatar and first name become a link to `/profile`,
  via `NavLink` for `aria-current="page"`. Visually hidden text reads "— profilim". New styles: pill
  hover (`--color-primary-tint`) and a subtle ring when current. The mobile menu's copy of the
  session actions gets the same link.
- **Game cards and the game page:** the host's name links to `/users/{host.id}` (needs T1.1).
- **Login round trip:** `proxy.ts` sends signed-out visitors from `/profile` to `/login?next=/profile…`
  with the query string kept.

---

## 7. Tasks

Each phase is one reviewable PR. Phase 1 changes nothing visible, and every later phase ships
something usable.

### Phase 0: Repo hygiene

- [x] **T0.1 Sync `package-lock.json`.** `npm ci` fails: the lockfile is missing `yaml@2.9.1`. Run
      `npm install`, commit only the lockfile, and confirm a clean `npm ci` succeeds.

### Phase 1: Backend and shared plumbing

- [x] **T1.1 Host id on game cards.** `lib/game-backend.ts`: `normalizeGameRecord` / `toGameCard`
      return `host.id` (string, or `null` when the host is missing). Update the game card JSON in
      `docs/api.md`. Test in `tests/game-backend.test.ts`.
- [x] **T1.2 `memberSinceLabel`.** Add a fixed `MONTHS_LONG` array (`yanvar … dekabr`; like
      `MONTHS_SHORT`, it doesn't depend on the ICU build) and `formatBakuMonthYear()` in
      `lib/game-backend.ts`. Return `memberSinceLabel` ("fevral 2026") from `getMyProfile` and
      `getPublicProfile`, and document it. Unit test includes the Baku month edge:
      `2026-01-31T21:00Z` → "fevral 2026".
- [x] **T1.3 Consistent stats.** `lib/profile-queries.ts`: today `counts.played` excludes hosted games
      while `stats.playedBySport` includes them, and "past" counts cancelled games as played.
      - Add a `playedWhere(now)` (past and `status != cancelled`) and use it for `played`,
        `hostedPast` and `playedBySport`.
      - The `when=past` lists keep using `upcomingWhere('past')`, so cancelled games still show there
        with their status.
      - Add `stats.totalPlayed` (the sum of `playedBySport`) and update `docs/api.md`.
      - Database tests: a cancelled past game isn't counted, and `totalPlayed === played + hostedPast`.
- [x] **T1.4 `parseProfileTabs()`.** A pure helper in `lib/game-backend.ts`: `?games` / `?when` →
      `{ role, when }`, defaulting to `joined` / `upcoming` and ignoring anything else. Unit tests.
- [x] **T1.5 Reusable `GamesGrid`.**
      - Replace the hard-wired `/api/v1/games` + `sport`/`to` with `endpoint` (default
        `/api/v1/games`), `query: Record<string, string | null | undefined>` and `cardContext` props.
        String props only, because it is a client component.
      - Add a shared `GamePage` type (`{ games: GameCard[]; pagination }`) to `lib/api-types.ts`
        for both list responses.
      - Update the `GamesSection` call.
      - Done when the home page and `/games` behave exactly as before.
- [x] **T1.6 `GameCard` contexts.**
      - `context?: 'browse' | 'joined' | 'hosting' | 'past'`, with the card actions from the table in
        §2. `browse` is today's behaviour.
      - The host name becomes a link to `/users/{host.id}` when an id is present.
      - `GameCardSkeleton` is unchanged.
- [x] **T1.7 `apiFetch` and `FormData`.** `lib/api-client.ts` only sets
      `Content-Type: application/json` when the body isn't `FormData`. Add a `patchJson` helper next
      to `postJson`.
- [x] **T1.8 Give spots back on account deletion** *(behaviour change; skip to keep today's)*.
      - In `deleteMyAccount`, inside the same transaction: for each participation in an upcoming,
        still-scheduled game the user doesn't host, add the spot back, capped at `max_players` with
        the same guarded `UPDATE` as `releaseSpot` in `lib/join-game.ts`.
      - Update the comment and `docs/api.md`.
      - Database test: an upcoming joined game regains its spot; a past one doesn't change.
- [x] **T1.9 Shared `PhoneInput`.** Extract the `+994` prefix input (formatting, `aria-describedby`
      wiring, error slot) from `JoinPanel`/`GameForm` into `components/ui/PhoneInput.tsx` and use it
      in both. No visual change.
- [x] **T1.10 Shared danger styles.** Move `.dangerZone`, `.dangerTitle`, `.dangerText`, `.dangerButton`,
      `.confirm` and `.confirmActions` from `GameForm.module.css` into `components/ui/danger.module.css`.
      GameForm uses the new file, with no visual change.

### Phase 2: `/profile` (read-only)

- [x] **T2.1 Protect the route.** Add `'/profile'` to the `proxy.ts` matcher.
- [x] **T2.2 Page and data.**
      - `app/(frontend)/profile/page.tsx` with `metadata.title = 'Profilim'`, the static shell and
        `ProfileContent`, as in §2 "Rendering".
      - `searchParams` is awaited inside the Suspense boundary.
      - Redirect to login when there's no user or no profile.
- [x] **T2.3 Styles.** `components/profile/Profile.module.css`:
      - Page rhythm, the overview grid (`701fr / 495fr`, `align-items: stretch`, one column
        < 860px), identity layout, stat tiles, sport rows, role tabs grid (2 columns) and the
        segmented control.
      - All values from §1, including the phone breakpoints.
- [x] **T2.4 `ProfileIdentity`** (server). The "Profili redaktə et" / "Əlavə et" slots stay empty
      until Phase 3.
- [x] **T2.5 `ProfileStats`** (server), including the "nothing played" text.
- [x] **T2.6 `ProfileTabs`** (client). Role tabs and time segments as links, with the `SportTabs`
      pattern (`useOptimistic`, `useTransition`, `data-pending`). Tabs have `aria-current`; the nav
      has `aria-label="Oyun filtri"`. The grid dims while pending (copy the
      `.section:has(nav[data-pending])` rule).
- [x] **T2.7 `ProfileGames`** (server). Heading, tabs, and either `GamesGrid` (endpoint
      `/api/v1/me/games`, `cardContext` from the tab, key per tab) or the matching `EmptyState` from
      the table in §2.
- [x] **T2.8 `AccountPanel`** with `LogoutButton`.
- [x] **T2.9 `ProfileSkeleton`** in `components/games/skeletons.tsx`, built from the real classes:
      a 96px circle and lines in the identity panel, three stat tiles and three bars, two tab cards,
      the segmented bar, and `GamesGridSkeleton count={3}`. `aria-busy="true"`.
- [x] **T2.10 Header link** (§6) in `Header.tsx` / `Header.module.css`, for both the bar and the
      mobile menu.
- [x] **T2.11 Docs.** Add `/profile` and `/users/[id]` to the structure table in `README.md` (the
      latter once Phase 4 ships).

### Phase 3: Editing and deleting

- [x] **T3.1 `EditProfileButton` + `EditProfileModal`** (client, `components/profile/`), everything
      in §3 except the picture row. Wire up the "Əlavə et" shortcut, which opens with the phone
      field focused (`data-autofocus` on phone, `focusKey`).
- [x] **T3.2 Header freshness check.** In a browser, edit the name and confirm the header chip
      updates after `router.refresh()`. If it doesn't, use a full reload after saving and comment why.
- [x] **T3.3 `DeleteAccount`** (client). The danger zone and confirm modal from §4, using
      `danger.module.css` from T1.10.
- [x] **T3.4 Tests.** If the PATCH-body builder (changed keys only, empty phone → `null`) is a pure
      function, unit-test it in `tests/`.

### Phase 4: Public profiles

- [x] **T4.1 Page.** `app/(frontend)/users/[id]/page.tsx` with a `cache()` loader, `generateMetadata`
      (name, `noindex`), the static shell, `PublicProfileSkeleton` and `notFound()` handling (§5).
- [x] **T4.2 Content.** Identity (name as `h1`), hosted-games stats ("Təşkilatçı": upcoming /
      `hostedPast`), a games grid in the browse context, and the empty state.
- [x] **T4.3 "Your own profile" notice** in its own Suspense boundary, linking to `/profile`.
- [x] **T4.4 Host links.** The name in the game page's host panel links to `/users/{host.id}`. Cards
      already link after T1.6.
- [ ] **T4.5 Optional caching** *(skipped)*. `getPublicProfile` doesn't depend on the viewer. It can use
      `use cache` + `cacheTag(GAMES_CACHE_TAG)` + the existing cache profile, like `findGames`.
      `updateMyProfile` and every game write already invalidate that tag.

### Phase 5: Profile pictures (security first)

- [x] **T5.1 Lock down `media`.** This is exploitable today: `collections/Media.ts` sets only `read`,
      so Payload's default `Boolean(user)` lets any signed-in user update or delete any upload,
      including venue photos, game covers and other people's avatars.
      - Add `uploadedBy` (relationship to `users`, read-only in admin), set in a `beforeChange` hook on create.
      - Access: create = signed in; read = public; update/delete = admin, or `uploadedBy` equals the user.
        Existing uploads have no owner, so only admins can change them.
      - Restrict `mimeTypes` to `image/jpeg`, `image/png`, `image/webp`. `image/*` allows SVG, which
        can carry scripts and would be served from our own origin.
      - Reject files over 4 MB with a hook check on the uploaded file's size (Vercel rejects bodies
        over 4.5 MB anyway, but with a worse error). Check the installed Payload version for a
        built-in limit option before hand-rolling one.
      - `npm run migrate:create` (needs `DATABASE_URL`; the adapter runs with `push: false`), then
        regenerate `payload-types.ts`.
- [x] **T5.2 Ownership check on save.**
      - `updateMyProfile` accepts a `profilePictureId` only if the user uploaded it (or it's already
        their picture). Otherwise it returns `MEDIA_NOT_FOUND`, which doesn't reveal that the upload
        exists. Today any media id works, including a venue photo.
      - `getMyProfile` returns `hasUploadedPicture`. Update the docs.
- [x] **T5.3 Database tests.**
      - Another user can't update or delete my upload (`overrideAccess: false` with their `user`).
      - `updateMyProfile` rejects someone else's upload.
      - An SVG upload is refused.
- [x] **T5.4 Picture row in the edit modal.**
      - Hidden `<input type="file" accept="image/jpeg,image/png,image/webp">` behind "Şəkli dəyiş".
      - Client checks with messages "Yalnız JPG, PNG və ya WebP şəkil yükləyin." and "Şəkil 4 MB-dan
        böyük ola bilməz.".
      - Upload immediately with `apiFetch('/api/media', { method: 'POST', body: formData })`
        (`file`, plus `_payload` = `{"alt":"{fullName} — profil şəkli"}`; `alt` is required), then
        preview.
      - "Yadda saxla" sends `profilePictureId`. "Şəkli sil" (only when `hasUploadedPicture`) sends
        `null`, which falls back to the Google photo, then initials.
      - Closing the modal without saving deletes the orphaned upload, best effort.
- [x] **T5.5 Image hosts.** Confirm uploaded avatars render through `next/image` locally
      (`/api/media/file/…`) and on Vercel Blob (already in `remotePatterns`).

### Phase 6: Leave a game

- [x] **T6.1 "Oyundan çıx".**
      - In `JoinPanel`, when `viewer.joined && !viewer.isHost` and the game hasn't started (status
        `open`/`full`): an `outlinePrimary` `lg` block button under "Siz bu oyuna qoşulmusunuz".
      - It opens a confirm modal: "Oyundan çıxmaq istəyirsiniz?" / "Yeriniz başqa oyunçuya açılacaq.
        Hosta xəbər verməyi unutmayın." / "İmtina et" · "Bəli, çıx" ("Çıxılır…").
      - Sends `POST /api/v1/games/{id}/leave`, then `router.refresh()`.
      - `NOT_JOINED` / `GAME_STARTED` show the server message and refresh.

### Phase 7: Verification and polish

- [x] **T7.1 Checks on every PR:** `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`.
      Baseline today: clean typecheck, 0 lint errors, 72 tests pass; the 24 database tests skip
      without `DATABASE_URL`.
- [x] **T7.2 Browser pass** against a seeded database, signed in through `/admin`:
      - [x] Header chip links to `/profile`, both in the bar and in the mobile menu
      - [x] Signed out, `/profile?games=hosting` → login → back to the same tab
      - [x] Tabs switch instantly (optimistic), the URL updates, reload keeps the tab (like the sport
            tabs they replace the history entry, so "back" leaves the page rather than stepping through tabs)
      - [x] "Daha çox" pages through `/api/v1/me/games`; "Az göstər" collapses
      - [x] All four empty states and their CTAs
      - [x] Joined cards never say "Qoşul"; hosting cards say "Redaktə et"; past cards show "Keçmiş oyun"
      - [x] Edit: rename → header and cards update; a taken phone → error on the phone field; clearing the phone works
      - [x] Delete a seed account → signed out on `/`, its hosted games gone, spots returned (T1.8)
      - [x] `/users/{id}`: no email/phone anywhere in the HTML, `noindex` present, unknown id → 404
      - [x] 360px wide: no horizontal scroll, panels stack, danger button full width
      - [x] Keyboard only: tab order, focus rings, modals trap focus and return it, Escape closes
      - [x] Screen reader: headings in order (h1 → h2 → h3), tab `aria-current`, live regions announce
            (checked in the DOM and accessibility tree with Playwright, not with a screen reader)
      - [x] `prefers-reduced-motion`: no stagger or fill animations
- [ ] **T7.3 Copy review** of every new Azerbaijani string by a native speaker (see §2–§5).
- [x] **T7.4 Docs.** `docs/api.md` for everything changed in Phases 1 and 5; `README.md` structure table.

## 8. Risks and notes

- **Header after edit** (T3.2): the private session cache is the one behaviour the Next docs don't
  settle. There is a fallback.
- **Migration** (T5.1) needs a database connection to generate and must run on deploy
  (`npm run migrate`) before the new code is served. Otherwise media queries fail on the missing column.
- **Phone changes don't touch existing games:** each game stores its own `contactPhone`, as the modal
  hint says. Updating the host's live games too would be a separate feature.
- **Cancelled upcoming games** fall out of both lists: "upcoming" requires `status = scheduled`,
  and "past" requires the start time to have passed. Only admins cancel games today. If that becomes
  a player action, show cancelled upcoming games under "Qarşıdakı" with their status.
- **Unbounded participation read** (`MAX_PARTICIPATIONS = 500` in `profile-queries.ts`) is fine at
  this scale and already flagged in the code.
