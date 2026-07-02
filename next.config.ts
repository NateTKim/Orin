import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // A stray package-lock.json in the user home directory makes Next.js
  // mis-detect the workspace root; pin it to this project.
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
