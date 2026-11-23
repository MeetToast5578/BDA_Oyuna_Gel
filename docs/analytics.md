# Google Analytics setup

The integration is off unless `NEXT_PUBLIC_GA_MEASUREMENT_ID` contains a valid GA4 ID (`G-…`). No Google analytics script or requests are loaded before a visitor accepts optional analytics. Refusal keeps the site usable. The footer's “Analitika seçimləri” reopens the choice; withdrawal disables this property and removes GA cookies accessible on this site. The consent preference lasts 180 days. With cookies blocked, consent cannot persist and tracking remains off.

## Owner setup

1. In analytics.google.com, choose/create a GA4 property. Open **Admin → Data collection and modification → Data streams → Web**. Choose/create the stream for `https://oyunagel.az`. Copy its **Measurement ID**, not the numeric property or stream ID.
2. In that stream, **disable Enhanced measurement**. This integration sends explicit page views and action events; automatic history/form/outbound-link measurement can duplicate events or collect unfiltered URLs. Leave Google signals, user-provided data collection and advertising features off; do not add another GA tag through Tag Manager or Vercel.
3. In Vercel, add `NEXT_PUBLIC_GA_MEASUREMENT_ID=G-YOURID` to the project's **Production** environment variables. It is public, not a secret. Redeploy: Next.js embeds public variables at build time. Do not enable production tracking in Preview/Development; use a separate test property if needed.
4. On the deployed site, first refuse analytics and verify there are no Google tag/collection requests. Reopen settings, accept and check GA Realtime for a page view. Navigate internally and verify one view per path change. Complete a real supported action to validate its event. Withdraw consent and verify further actions are not sent. Ad blockers may prevent measurement even after consent.

Events: `page_view`, `game_created`, `game_joined`, `waitlist_joined`, `sport_selected`, `venue_map_opened` ("Xəritədə aç" on a venue page; carries only the venue's numeric id, for the partner-venue reports in `docs/business-model.md`), and `login` (successful Google sign-in only, consent must already exist). Edits, failed requests and cancelled sign-ins do not count as completed actions. Login uses a one-time 60-second marker without any account identifiers.

Page locations use route templates (`/games/:id`, `/teams/join/:code`) with no query/hash; page titles are a fixed brand string and referrers are blank. Actions carry only an allowlisted sport, a numeric venue id or the login method. Names, phones, emails, user IDs, game titles, search terms and private links are not supplied as event parameters. GA still processes standard technical data; see the privacy page. This is aggregate product measurement, not an authoritative count of database activity.

Local checks can use a fake ID with Google requests intercepted; never send synthetic tests to the production property. Automated checks cover privacy filtering, consent gating and optional tracking failures. Real GA delivery requires the owner's ID and a deployed browser check; it is not established by a local test.
