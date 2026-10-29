import { postgresAdapter } from "@payloadcms/db-postgres";
import { nodemailerAdapter } from "@payloadcms/email-nodemailer";
import { vercelBlobStorage } from "@payloadcms/storage-vercel-blob";
import path from "path";
import { buildConfig } from "payload";
import { fileURLToPath } from "url";
import sharp from "sharp";

import { Users } from "./collections/Users";
import { Media } from "./collections/Media";
import { Arena } from "./collections/Arena";
import { Teams } from "./collections/Teams";
import { Games } from "./collections/Games";
import { GameParticipants } from "./collections/GameParticipants";
import { JoinAttempts } from "./collections/JoinAttempts";
import { GameInvites } from "./collections/GameInvites";
import { GameWaitlist } from "./collections/GameWaitlist";
import { RateLimits } from "./collections/RateLimits";
import { Notifications } from "./collections/Notifications";
import { PushSubscriptions } from "./collections/PushSubscriptions";
import { MAX_UPLOAD_BYTES } from "./lib/uploads";

/**
 * Only a well-formed token counts. `vercel env pull` writes the literal "[SENSITIVE]" for secrets it
 * may not export, and the adapter throws on a malformed token at config load — which takes the whole
 * app down, not just uploads. An unusable token therefore means "no Blob", same as an absent one.
 */
const blobToken = /^vercel_blob_rw_[a-z\d]+_[a-z\d]+$/i.test(process.env.BLOB_READ_WRITE_TOKEN ?? "")
  ? (process.env.BLOB_READ_WRITE_TOKEN as string)
  : "";

/**
 * Emails go out through Gmail with an App Password (Google account → Security → 2-Step Verification
 * → App passwords); the Google sign-in keys can't send mail. Without both values Payload only logs
 * each email to the console, so local runs and tests never send anything.
 */
const gmailUser = process.env.GMAIL_USER ?? "";
const gmailAppPassword = (process.env.GMAIL_APP_PASSWORD ?? "").replace(/\s/g, "");

const filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(filename);

export default buildConfig({
  admin: {
    user: Users.slug,
    importMap: {
      baseDir: path.resolve(dirname),
    },
  },
  collections: [Users, Media, Arena, Teams, Games, GameParticipants, JoinAttempts, GameInvites, GameWaitlist, RateLimits, Notifications, PushSubscriptions],
  upload: {
    // Vercel refuses request bodies over 4.5 MB before they reach the app, with a bare error page;
    // stopping at 4 MB here answers with a message instead. The picture pickers check it too.
    limits: { fileSize: MAX_UPLOAD_BYTES },
    abortOnLimit: true,
    responseOnLimit: "Şəkil 4 MB-dan böyük ola bilməz.",
  },
  // Nothing in the app queries GraphQL; the REST API under /api/v1 is the only data surface.
  graphQL: { disable: true },
  secret: process.env.PAYLOAD_SECRET || "",
  typescript: {
    outputFile: path.resolve(dirname, "payload-types.ts"),
  },
  db: postgresAdapter({
    // DATABASE_URL is a pooled (PgBouncer) endpoint. Drizzle's dev-time schema push introspects via
    // session-level queries the pooler drops mid-flight, which fails Payload init and breaks every
    // write in the admin panel. Schema changes go through migrations instead.
    push: false,
    pool: {
      // pg already reads sslmode=require (what Neon and Vercel hand out) as verify-full, and warns on
      // every connect that pg v9 will weaken it. Spelling out verify-full keeps today's check, quietly.
      connectionString: (process.env.DATABASE_URL || "").replace(
        /\bsslmode=(prefer|require|verify-ca)\b/,
        "sslmode=verify-full",
      ),
    },
  }),
  email:
    gmailUser && gmailAppPassword
      ? nodemailerAdapter({
          defaultFromAddress: gmailUser,
          defaultFromName: "OyunaGəl",
          // Checking the login on every cold start would add a round trip to Google; a bad password
          // shows up as a logged send failure instead (lib/notify.ts never lets one fail a request).
          skipVerify: true,
          transportOptions: {
            host: "smtp.gmail.com",
            port: 465,
            secure: true,
            auth: { user: gmailUser, pass: gmailAppPassword },
          },
        })
      : undefined,
  sharp,
  plugins: [
    // Vercel's filesystem is read-only and per-invocation, so uploads cannot live on disk there.
    // Disabled without a token so local dev keeps writing to ./media and needs no Blob store.
    vercelBlobStorage({
      enabled: Boolean(blobToken),
      collections: { media: true },
      token: blobToken,
    }),
  ],
});
