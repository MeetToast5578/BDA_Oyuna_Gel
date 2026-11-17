# Admin email alerts

Use `oyunagel465@gmail.com` as the central inbox. The website can send from that account to the same inbox; Gmail forwarding then sends copies to each administrator's own address. Gmail's Sent folder and the central inbox retain a shared history. No shared Gmail password is needed for forwarding recipients.

Receiving alerts does not assign an admin role inside the website; application permissions are separate.

## Gmail setup (account owner)

1. Sign in to `oyunagel465@gmail.com` at myaccount.google.com and enable **Security → 2-Step Verification**.
2. Open https://myaccount.google.com/apppasswords and create an App Password named “OyunaGəl admin alerts”. Some managed accounts or account security settings do not permit App Passwords; if unavailable, use a supported transactional email provider instead. Do not disable security settings to force it.
3. Enter the App Password securely in Vercel project settings; never paste it into chat, commit it, or use the normal Gmail password. Google displays it once. It can be revoked from the same account screen.

## Vercel Production variables

| Variable | Value |
| --- | --- |
| `ADMIN_EMAIL_ENABLED` | `true` |
| `ADMIN_GMAIL_USER` | `oyunagel465@gmail.com` |
| `ADMIN_GMAIL_APP_PASSWORD` | App Password entered as a sensitive secret |
| `ADMIN_ALERT_EMAIL` | Optional; defaults to `ADMIN_GMAIL_USER` |
| `NEXT_PUBLIC_SITE_URL` | Recommended: `https://www.oyunagel.az` for email links |

Set the sender settings only for **Production**, merge the feature and redeploy. Preview deployments explicitly suppress admin emails even if settings are copied. Without the enable flag and complete, valid sender settings, alerts remain off. The dedicated admin transport does not turn on the existing player-email transport (`GMAIL_USER` / `GMAIL_APP_PASSWORD`). SMTP uses TLS on port 465 with verification intact and bounded connection/socket timeouts. No database migration is required.

## Forward alerts to administrators

In Gmail on a computer: **Settings → See all settings → Forwarding and POP/IMAP → Add a forwarding address**. Each recipient must confirm the verification sent by Google. To forward only website alerts, create a Gmail filter for messages from `oyunagel465@gmail.com` with subject containing `OyunaGəl admin`, and choose **Forward it**. Add a verified address/filter for each admin and retain the inbox copy. Test that matching messages actually forward; Gmail may suppress loops/self-forwarding. For administrators who need to work in the shared inbox itself, Gmail delegation is an alternative to sharing a password.

## Events and contents

- New player registration through Google sign-in (not every repeat login).
- Successful game creation.
- Successful join and leave.
- Successful game edit or deletion.

Alerts run after the stored action succeeds. Validation errors, rejected joins, failed registrations and normal page views do not produce alerts. Game deletion links to the games list rather than the deleted page. The email contains the actor's display name, game title where relevant, Baku time, and profile/game links. It does not include phone numbers, private group links, OAuth credentials or form request bodies. SMTP subjects are fixed and HTML text is escaped. Admin messages are operational notices, independent of a player's optional participant-email preference.

This first version covers these website flows, not arbitrary SQL changes, every Payload admin-panel edit, waitlist promotion, or every possible account/club action. Delivery is best effort using Next.js `after()`: failed attempts log `admin_email` with event and status, without credentials or raw SMTP errors. User actions do not wait on SMTP or fail because email fails. There is no durable retry queue or exactly-once delivery guarantee in this version; the database remains the authoritative record. A durable outbox can be added if stronger delivery guarantees are needed.

## Activation check

After deployment and secure configuration, have an admin perform a legitimate action and confirm one email in the central inbox and the intended forwarding recipients. Check spam and the `admin_email` status in Vercel function logs if it is absent. Do not create fake production players/games for testing. SMTP acceptance does not prove inbox delivery. If alerts are too noisy, set `ADMIN_EMAIL_ENABLED=false` and redeploy.

Automated tests use mocked SMTP and a disposable local database. No real email or production data is needed to validate the code. Live sending remains unverified until the account owner configures the App Password and confirms delivery.
