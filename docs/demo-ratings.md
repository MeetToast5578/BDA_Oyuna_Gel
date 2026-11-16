# Sport-specific development player pools

The ratings page shows only database-backed players and clubs. The “Nümunə” sample tab and fictional display table have been removed; old `view=demo` links fall back to the regular players view.

## Authored fixture pools

`lib/demo-players.ts` holds 48 explicitly fictional personas, with unique display names and stable sport-specific seed email addresses:

- Football: 24 male personas.
- Basketball: 16 different male personas.
- Tennis: 8 different personas, including four female personas.

This is an editorial choice for examples, not a runtime classification of real people. No gender field, name-based gender inference, real-user exclusion or single-sport eligibility restriction is added. Real people with counted results can rank in every sport they play. The existing exclusion of marked demo games from real ratings remains in place.

## Development seeding

The development seed shares these pools. Hosts, registered participants, club members and captains are picked only from the corresponding sport. All generated games have `isDemo: true` and a “Nümunə” title prefix, so fictional scores cannot populate real leaderboards. There is no sample ratings display.

**Do not run `npm run seed` against a live or mixed database.** It still clears games, clubs and venues. Use only a disposable development database, after applying migrations. This change does not rewrite old seed data already deployed, rename real accounts, delete existing participants or backfill gender. The add-only `demo:refresh` command from the previous stage still creates future view-only game examples without scores; it does not refresh historical ratings.

Changing existing production sample data requires identifying those records explicitly and agreeing a targeted migration. Names and dates alone do not prove that a record is fictional. No production data changes are part of this PR.

## Verification

Tests cover pool/name/email separation, roster capacity, and a real player retaining counted results in both football and basketball. Run database tests against disposable databases only. Local seed verification checks host/participant/member/captain sport assignments. Removing the sample UI does not update the production database.
