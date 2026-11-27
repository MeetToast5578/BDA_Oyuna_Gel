# Telegram channel: new games posted automatically

When someone creates a real game on the site, a bot posts it to a Telegram channel: title, sport and
level, day and time, venue, free spots and the link. WhatsApp channel admins can copy posts from there,
and players can follow the Telegram channel directly. WhatsApp has no way for a program to post to a
Channel, which is why this goes through Telegram.

What is posted: only public game details. Never the host's phone number or the game's WhatsApp/Telegram
group link. Demo games, edits and deletions are not posted.

## Setup (once)

1. In Telegram, open **@BotFather**, send `/newbot`, pick a name (e.g. "OyunaGəl") and a username
   ending in `bot`. BotFather replies with a token like `123456789:AA...`. Treat it like a password.
2. Create a **public channel** (e.g. `@oyunagel_oyunlar`). In the channel's settings, add the bot as an
   **administrator** with permission to post messages.
3. In Vercel → the project → Settings → Environment Variables, add for **Production** only:

   | Name | Value |
   |---|---|
   | `TELEGRAM_BOT_TOKEN` | the token from BotFather |
   | `TELEGRAM_CHANNEL_ID` | the channel's username, with the `@` (e.g. `@oyunagel_oyunlar`) |

   A private channel has no username: use its numeric id instead (starts with `-100`).
4. Redeploy production so the variables take effect.

## Check

Create a test game on the live site. Within a few seconds the post appears in the channel. If it doesn't,
the Vercel function logs show `telegram_post` with the HTTP status Telegram returned (403 usually means
the bot is not an admin of the channel; 400 usually means a wrong channel id). Delete the test game on
the site and the post in the channel by hand.

## Behaviour

- Off unless both variables are set; always off on Preview deployments, so test games there never post.
- Best effort: sent after the response via `after()`, 5-second timeout, no retry. A failed post never
  affects creating the game.
- Code: `lib/telegram.ts`, called from `POST /api/v1/games`. Tests: `tests/telegram.test.ts`.
