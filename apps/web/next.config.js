const path = require("node:path");

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { hostname: "lh3.googleusercontent.com" },
      { hostname: "avatars.githubusercontent.com" },
      { hostname: "cdn.discordapp.com" },
    ],
  },
  rewrites() {
    const elysiaUrl = process.env.ELYSIA_URL || "http://api:3001";
    return [
      // Auth routes: preserve the /api prefix so Better Auth receives /api/auth/*
      {
        destination: `${elysiaUrl}/api/auth/:path*`,
        source: "/api/auth/:path*",
      },
      // All other API routes: strip /api prefix (Elysia routes live at /, not /api/)
      {
        destination: `${elysiaUrl}/:path*`,
        source: "/api/:path*",
      },
    ];
  },
  // @moby/types ships raw TypeScript (main: ./src/index.ts); transpile it so
  // runtime exports (e.g. USER_PROFILE_FIELDS) work in the browser bundle.
  transpilePackages: ["@moby/types"],
  turbopack: {
    root: path.resolve(import.meta.dirname, "../../"),
  },
};
module.exports = nextConfig;
