import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // This repo is a monorepo (web/ isn't the git root) — without this,
  // Turbopack walks up looking for a workspace root and can pick up an
  // unrelated lockfile above the repo entirely (seen locally: a stray
  // package-lock.json in the user's home directory), which is harmless but
  // non-deterministic. Pinning it to this directory matches Vercel's own
  // "Root Directory = web" project setting (see ../DEPLOYMENT.md).
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
