import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
};

// LD-FE-11: next-navigation update — register, don't force-activate.
const withSerwist = withSerwistInit({
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
  register: false,
  // Offline-first: a hard reload on reconnect aborts in-flight queue replay
  // and strands Dexie write-queue entries (e2e golden path 7).
  reloadOnOnline: false,
});

export default withSerwist(nextConfig);
