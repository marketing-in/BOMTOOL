import type { NextConfig } from "next";

// `npm run serve` builds without re-running tsc and ESLint — `npm run typecheck`, `npm run lint` and the tests
// do that — which roughly halves the build on a 2-core laptop and keeps it within memory.
const skipChecks = process.env.SKIP_BUILD_CHECKS === "1";

const nextConfig: NextConfig = {
  // Builds can go to their own folder while `next dev` uses .next: e2e → .next-e2e, `npm run serve` → .next-prod.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // Loaded with Node's require at runtime instead of being bundled (they use Node built-ins).
  // node-unrar-js reads its WebAssembly file from its own folder.
  serverExternalPackages: ["bullmq", "ioredis", "node-unrar-js"],
  // The RAR reader's WebAssembly is read from disk at run time, which the file tracer cannot see: ship it with every
  // server function, or a RAR of Gerbers fails on Vercel ("ENOENT … unrar.wasm").
  outputFileTracingIncludes: { "/**": ["./node_modules/node-unrar-js/dist/js/unrar.wasm"] },
  typescript: { ignoreBuildErrors: skipChecks },
  eslint: { ignoreDuringBuilds: skipChecks },
  experimental: {
    // BoM uploads go through a server action; allow files up to MAX_BOM_BYTES (10 MB) plus form overhead.
    // Board uploads allow 20 MB of Gerbers (MAX_UPLOAD_BYTES) plus the form around them.
    serverActions: { bodySizeLimit: "24mb" },
    // Both are large package indexes: compile only the pieces a page imports, not the whole package.
    optimizePackageImports: ["radix-ui", "@react-three/drei"],
    // A lower memory peak during `next build`, for a little build time.
    webpackMemoryOptimizations: true,
  },
};

export default nextConfig;
