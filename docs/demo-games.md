# Refreshing example games safely

`npm run demo:refresh` is a read-only preview. It plans 21 examples: football, basketball and tennis at 19:00 Baku time, tomorrow through seven days ahead. It reports counts only, not database credentials or player details.

## Local development

Run migrations first, then preview and apply:

```sh
npm run migrate
npm run demo:refresh
npm run demo:refresh -- --apply
npm run demo:refresh
```

The last preview should report `wouldCreate: 0`. Same-day reruns are idempotent; tomorrow's run adds only the new final day's three games. Dates are calculated in Asia/Baku, independent of the server time zone. No scheduler is enabled by this change.

The command creates a reserved, randomly passworded demo host and three clearly named example venues if absent. It does not rename existing users, change real venues, create teams/participants/results, reset sequences, truncate tables, or move old games. There are no invented contact numbers or external group links. Existing games, including old seed games, remain untouched. One host spot is counted in each example; no fictitious crowd is created.

`isDemo` is a durable marker on games; `demoKey` uniquely identifies the sport and date. An advisory lock serialises refreshes across machines, and the unique database index guards against duplicates. Game inserts are transactional; if a failure happens during resource creation, labelled demo host/venue records may remain and are reused on retry. The script refuses to reuse a reserved host that has a Google identity, admin role or unexpected display name. It never converts existing games to demos based on names or age.

## What visitors see

Cards and details explicitly say the game is an example, not a real event. Cards link to view the example instead of joining. The backend refuses joins, waitlisting and automatic waitlist promotion for demo games. They have no results; rating queries also exclude demo games if an administrator later adds a score.

## Live rollout — pending owner confirmation and access

1. Confirm whether live data is demo, real, or mixed. If unknown, treat it as mixed. This refresh remains add-only regardless of the answer.
2. Deploy the schema migration and the updated application together before adding examples. Older app versions do not enforce the demo booking restriction.
3. With the intended production database securely configured in the execution context, run the read-only preview and review counts. Never paste database credentials into chat or commit them. Use a direct/unpooled connection if the provider's pooler does not support session advisory locks; the script retains one connection for the lock.
4. After confirming the target and rollout, explicitly run `npm run demo:refresh -- --apply --allow-remote`. Remote writes require both flags. Preview again to confirm zero additions, then inspect cards and details on the deployed site.
5. Game read caches refresh within about a minute; the CLI cannot invalidate caches in running Next.js instances. Allow the cache window or redeploy and recheck. No live refresh is performed just by merging this PR.

**Do not use `npm run seed` to refresh a live or mixed database.** That older development script clears games, venues and teams. This command does not clean up those older examples, archive historical results, change real players' eligibility, or supply the GA measurement ID. Retention/archival and distinct demo player pools are later plan stages.

Tests cover dry-run purity, concurrency, repeatability, Baku dates, historical preservation, blocked booking, and rating exclusion. Run database tests only against a disposable test database.
