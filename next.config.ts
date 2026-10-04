import type { NextConfig } from "next";

// next-intl locates the request config through this alias. Its bundled plugin
// would set it for us, but the plugin eagerly loads @swc/core (for an optional
// message extractor we do not use), whose native binding refuses to load on
// some Windows setups. Setting the alias directly avoids that dependency.
const nextIntlRequestConfig = "./src/i18n/request.ts";

const nextConfig: NextConfig = {
  reactCompiler: true,
  turbopack: {
    resolveAlias: { "next-intl/config": nextIntlRequestConfig },
  },
};

export default nextConfig;
