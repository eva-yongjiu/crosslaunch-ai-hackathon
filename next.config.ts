import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emit a self-contained production server so deployment does not need the
  // application source tree or a second build step.
  output: "standalone",
};

export default nextConfig;
