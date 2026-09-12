import type { NextConfig } from "next";

const configuredBasePath = process.env.NEXT_PUBLIC_BASE_PATH?.trim() ?? "";
const basePath = configuredBasePath === "/" ? "" : `/${configuredBasePath.replace(/^\/+|\/+$/g, "")}`.replace(/^\/$/, "");

const nextConfig: NextConfig = {
  // Emit a self-contained production server so deployment does not need the
  // application source tree or a second build step.
  output: "standalone",
  basePath,
};

export default nextConfig;
