import type { NextConfig } from "next";

// next-intl locates the request config through this alias. Its bundled plugin
// would set it for us, but the plugin eagerly loads @swc/core (for an optional
// message extractor we do not use), whose native binding refuses to load on
// some Windows setups. Setting the alias directly avoids that dependency.
const nextIntlRequestConfig = "./src/i18n/request.ts";

const isDevelopment = process.env.NODE_ENV === "development";

/**
 * Content Security Policy. Stripe's card form needs its script and frames;
 * everything else is served from this site. Inline scripts are allowed because
 * the framework emits them; a nonce-based policy is a later hardening step.
 */
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' https://js.stripe.com${isDevelopment ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self' https://api.stripe.com${isDevelopment ? " ws:" : ""}`,
  "frame-src https://js.stripe.com https://hooks.stripe.com",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "base-uri 'self'",
  "object-src 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  // Other sites learn only that a visitor came from this site, never which page.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(self \"https://js.stripe.com\")" },
  ...(isDevelopment ? [] : [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]),
];

const nextConfig: NextConfig = {
  reactCompiler: true,
  poweredByHeader: false,
  turbopack: {
    resolveAlias: { "next-intl/config": nextIntlRequestConfig },
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // Pages that carry a secret token or staff data must never be stored by a shared cache.
      {
        source: "/:locale/(reserve|reservation)/:token",
        headers: [
          { key: "Cache-Control", value: "private, no-store" },
          { key: "Referrer-Policy", value: "no-referrer" },
        ],
      },
      { source: "/manage/:path*", headers: [{ key: "Cache-Control", value: "private, no-store" }] },
    ];
  },
};

export default nextConfig;
