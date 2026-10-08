# BDA_Oyuna_Gel

A [Next.js](https://nextjs.org) app with [Payload CMS](https://payloadcms.com) as the backend, backed by Postgres.

## Getting started

1. Create a `.env` file with:

   ```
   PAYLOAD_SECRET=<any random string>
   DATABASE_URL=<postgres connection string>
   # Optional: CDN origin that serves /api/media/*, used in API image URLs
   MEDIA_BASE_URL=https://cdn.example.com
   # Optional: "Continue with Google" (the button is hidden without these)
   GOOGLE_CLIENT_ID=<OAuth client id>
   GOOGLE_CLIENT_SECRET=<OAuth client secret>
   ```

   Google sends users back to `/api/auth/google/callback` on the site they signed in from, so every
   origin you use must be listed under **Authorized redirect URIs** in the Google Cloud OAuth client, e.g.
   `http://localhost:3000/api/auth/google/callback` and `https://bda-next-six.vercel.app/api/auth/google/callback`.

2. Install and run:

   ```bash
   npm install
   npm run dev
   ```

- App: [http://localhost:3000](http://localhost:3000)
- Payload admin: [http://localhost:3000/admin](http://localhost:3000/admin)
- Fill the database with sample venues, players and games: `npm run seed`
- API reference: [docs/api.md](docs/api.md)

## Deploying to Vercel

1. Import the repo in Vercel (framework preset: Next.js, no other build settings needed).
2. Add a Blob store under **Storage** and connect it to the project; that sets `BLOB_READ_WRITE_TOKEN`.
   Uploads go to Blob whenever the token is set; without it they are written to `./media`, which
   Vercel's read-only filesystem rejects.
3. Set `PAYLOAD_SECRET`, `DATABASE_URL` and, for Google sign-in, `GOOGLE_CLIENT_ID` /
   `GOOGLE_CLIENT_SECRET`, and add `https://<your-domain>/api/auth/google/callback` to the OAuth
   client's redirect URIs.

Vercel runs `npm run vercel-build`, which applies pending migrations (`payload migrate`) before
building. Preview deployments migrate whatever database their `DATABASE_URL` points at, so give
previews their own database if they shouldn't touch production.

## Structure

| Path                | What it holds                                                   |
| ------------------- | --------------------------------------------------------------- |
| `app/(frontend)`    | Public site: home, `/games`, `/games/past`, `/games/[id]`, `/games/new`, `/games/[id]/edit`, `/login`, `/profile`, `/users/[id]` |
| `components/`       | Frontend components (CSS Modules); design tokens are in `app/(frontend)/globals.css` |
| `app/(payload)`     | Payload admin panel and its REST/GraphQL routes (generated)       |
| `app/api`           | Custom API routes — games, sports, Google auth                    |
| `collections/`      | Payload collection definitions                                    |
| `lib/`              | Shared server helpers                                             |
| `proxy.ts`          | Sends signed-out visitors from sign-in-only pages to `/login` before they render |
| `scripts/`          | One-off dev scripts (`seed.ts`)                                   |
| `payload.config.ts` | Payload configuration                                             |

## Scripts

| Command                 | Description                                  |
| ----------------------- | -------------------------------------------- |
| `npm run dev`           | Start the dev server                          |
| `npm run build`         | Production build                              |
| `npm start`             | Serve the production build                    |
| `npm run lint`          | Run ESLint                                    |
| `npm test`              | Run the Vitest suite (join tests use `DATABASE_URL`) |
| `npm run seed`          | Reset and fill the database with sample data  |
| `npm run migrate`       | Apply pending database migrations (run it before starting a new version) |
