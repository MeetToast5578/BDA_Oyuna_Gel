# Site branding, analytics, games and ratings

## 1. Branded icons (current scope)

Replace the default browser favicon with an OyunaGəl mark: a white O and orange dot on the existing purple brand colour. Keep browser, Apple home-screen and installable-app icons consistent. Retain an editable SVG source and a repeatable generation command. Verify small sizes, manifest references and icons served by Next.js. Deliver through a PR; deployment follows merging.

Implemented on this branch. Edit `public/icons/oyunagel.svg`, then run `node scripts/generate-icons.mjs` from the repository root to generate the 16/32/48 px favicon, 180 px Apple icon, and 192/512 px app icons. Uses the existing Sharp dependency. Checked rendered artwork, repeatable generation, served favicon bytes, page metadata links, Apple icon response and manifest icon dimensions. Deployment remains pending merge.

## 2. Analytics

Add GA4 after the owner supplies the measurement ID and confirms the consent approach and privacy notice. Track page views and successful game creation, joining, waitlisting and sign-in, plus sport selection. Count completed actions, not just button clicks. Never send names, email addresses, phone numbers or private group links. Verify navigation tracking and prevent duplicate events.

Consent-first integration implemented; see `docs/analytics.md` for configuration and verification. The owner chose opt-in consent. Tracking remains disabled until the production GA4 measurement ID is supplied and the site is redeployed. Local verification uses an intercepted fake tag, not the production property; real delivery is still pending the owner's ID.

## 3. Fresh games

First establish which live accounts and games are demo versus real. Inspect counts without exposing personal data. Do not run the existing destructive seed script against production. Design a targeted, repeatable refresh for explicitly marked demo games, keeping real games untouched. Label demo events so visitors cannot mistake them for bookable games. For real events, consider organiser-approved recurring fixtures rather than moving historical dates. Validate the change in a test database before any live update.

Implemented an add-only, dry-run-first refresh; see `docs/demo-games.md`. It adds seven future Baku evenings per sport with durable demo markers and duplicate protection. Demo games cannot be booked and do not affect ratings. Existing dates, results, accounts and venues remain unchanged. Live data classification and production rollout remain pending; no live database refresh is implied by this code change.

## 4. History and storage

Measure database tables, indexes and uploaded media before choosing retention limits. Verify CRON_SECRET and successful daily cleanup runs; code existing in the repository does not prove production execution. Preserve historical results and participation needed for ratings and profiles. Start with past-game views, existing transient-data cleanup and image optimisation. If measurements justify archival, design a backup, result-preservation and restore process before removing data. Live deletion or archival requires an agreed scope.

Read-only storage audit and cleanup preview implemented; see `docs/storage-and-retention.md`. The existing retention rules are unchanged, but cron/CLI cleanup now runs in a transaction and cron logs include completion time, duration and counts. Local tests cover audit/preview purity, rollback, repeatability and preserved player results. Production storage measurement, secret binding and actual cron execution remain unverified. No historical games or media are deleted or compressed by this stage.

## 5. Ratings and demo players

Sport filters already exist. For demo data, use independent player pools for football, basketball and tennis; the requested female demo representation can be confined to tennis. Do not infer real users' gender from names or prevent genuine multi-sport players from appearing in each sport they play. If real competitions require men's, women's or mixed divisions, agree explicit eligibility rules and represent those divisions in data before filtering rankings. Verify per-sport and per-period records from confirmed results.

## Decisions needed before later stages

- Is the live data wholly demo, or a mixture of demo and real activity?
- Which GA4 property should receive events, and what consent approach is required?
- Are distinct player lists and gender restrictions requests about demo examples or actual competition eligibility?
- What storage usage and historical retention requirements warrant archival?

Stages 1–3 have been merged; their live configuration/data prerequisites still apply. Stage 4's audit and safer existing cleanup are implemented for review and local validation. Live measurements and cron verification need production access. Demo player pools remain the next stage. No stage authorises deleting real historical data.
