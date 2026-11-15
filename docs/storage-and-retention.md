# Storage audit and existing retention cleanup

## Start with measurements

From the repository root, with the intended database securely configured:

```sh
npm run storage:audit
npm run storage:cleanup
```

Both commands are read-only by default. The audit always runs in a read-only, repeatable-read database transaction and rejects `--apply`. Cleanup without flags previews candidates using the exact same predicates as the existing daily job. Neither command prints user identities, contact details, media URLs, database URLs or credentials. Run migrations before auditing an older database.

The report includes database bytes, table/index/total relation bytes, estimated table row counts, exact game age/demo/score counts, recorded upload sizes (original plus thumbnail/full variants), and the existing cleanup candidates. Category counts can overlap: phone redactions and a group-link redaction may concern the same game. They are not a count of deletable games or recoverable bytes.

`estimatedRows` comes from PostgreSQL statistics and can be stale. Database size includes system data and overhead; relation sizes will not sum exactly to it. Media sizes come from database metadata and may be incomplete. The local `media/` scan counts physical files without following symlinks or printing names; it reports unavailable or unreadable entries explicitly. It can include bundled images not represented in the database. It does not measure the production Vercel Blob store. Check provider storage/billing for actual Blob usage; metadata, local disk and provider object sizes are different observations.

## Apply only the established transient-data policy

```sh
npm run storage:cleanup -- --apply
```

Remote writes additionally require `--allow-remote`; confirm the database and preview first. The command applies one transaction: a failure rolls all steps back. Repeating a completed run should find no eligible records unless more have expired or been created meanwhile.

Unchanged retention rules:

| Data | Rule |
| --- | --- |
| Join/leave audit rows | Remove after 90 days |
| Rate-limit windows | Remove after one day |
| Waitlists | Remove once the game's start time has passed |
| Phone numbers on games/participants; private group links | Clear after 30 days from game start |
| Read notifications | Remove after 90 days from creation |
| Unread notifications | Remove after 180 days from creation |

Games, scores, participation rows, accounts, venues, clubs and uploaded images are retained. In particular, participant phones are cleared while their result/participation rows remain. Real historical results continue to feed profiles and ratings. No new archival/deletion ages are introduced.

## Verify the production cron

The existing `vercel.json` schedules `/api/cron/cleanup` daily at **03:17 UTC (07:17 Baku)**. The route requires `Authorization: Bearer $CRON_SECRET` and refuses calls if the binding is missing. Audit output only reports whether the local binding exists; it does not prove the production binding or job execution works.

In Vercel project settings, securely configure a strong `CRON_SECRET` for Production, deploy, and confirm that the scheduled job is enabled. Inspect actual function/cron logs for successful runs: logs now contain completion time, duration and aggregate counts, or a failure indication. Verify the latest production deployment and timestamp; an older success is not evidence the current schedule works. Never paste the secret into chat or commit it.

An authenticated request to `/api/cron/cleanup?dryRun=1` previews without mutations and returns `Cache-Control: no-store`. `dryRun=0` or the normal scheduled URL applies the established policy in a transaction. Malformed/unknown query options return 400 instead of accidentally applying a mistyped preview. Mutations invalidate relevant Next.js game caches after contact redactions. CLI runs cannot invalidate another instance's cache; allow the read-cache window (about a minute) or redeploy before checking redacted data.

## Archival and compression decisions

Do not delete old games because a page looks stale. Use future demos/organiser-approved fixtures for freshness and the existing past-game views for history. If the production report shows a real storage problem:

1. Identify whether database tables, indexes or uploaded media dominate; record provider limits and growth.
2. Verify a current backup and test restoring it in a separate environment.
3. If media dominates, first inspect references and image variants. New uploads already generate optimised WebP variants. Do not recompress or delete old objects without a manifest of referenced files, image-quality checks and a recoverable copy.
4. If historical records dominate, design an archive that preserves results/participation used by both normal standings and Elo replay, plus a retrieval/restore path. Storing summaries alone will not preserve every current query. Agree a retention period before implementing or applying it.
5. Normal PostgreSQL deletes free space for reuse; they do not promise an immediate billing reduction. Do not run `VACUUM FULL`, truncate tables or rebuild indexes as a routine cleanup: those require a separate operational plan.

This change adds measurement and safer execution of the existing policy. It does not verify live storage usage, enable production secrets, delete old games, compress uploads, or publish an archive. Production audit and cron verification remain pending access to that environment.
