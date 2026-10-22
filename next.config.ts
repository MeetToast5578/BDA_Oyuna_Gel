import { withPayload } from "@payloadcms/next/withPayload";
import type { NextConfig } from "next";

const mediaBaseUrl = process.env.MEDIA_BASE_URL?.replace(/\/+$/, "");

const nextConfig: NextConfig = {
  // Lets every route prerender a static shell and stream the request-dependent parts (the signed-in
  // header chip) behind Suspense, instead of blocking the whole page on a session lookup.
  cacheComponents: true,
  poweredByHeader: false,
  experimental: {
    // app/global-not-found.tsx: unknown URLs get the site's own 404, not Next's English default.
    globalNotFound: true,
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // No other site may frame ours (clickjacking "Hesabı sil", join buttons). Only this
          // directive: a full script CSP would have to allow the Payload admin's inline scripts.
          { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
  images: {
    // AVIF where the browser accepts it, WebP otherwise.
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      // Google profile pictures saved at Google sign-in (users.avatarUrl).
      new URL("https://lh3.googleusercontent.com/**"),
      // Uploads, once the Vercel Blob plugin is active: media.url becomes an absolute Blob URL
      // on the store's own subdomain. Object form because new URL() cannot carry the wildcard.
      { protocol: "https" as const, hostname: "*.public.blob.vercel-storage.com", pathname: "/**" },
      ...(mediaBaseUrl ? [new URL(`${mediaBaseUrl}/**`)] : []),
    ],
  },
};

export default withPayload(nextConfig);
