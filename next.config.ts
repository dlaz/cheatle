import type { NextConfig } from "next";
import { basePath } from "./lib/config";

const nextConfig: NextConfig = {
  output: "export",
  basePath: basePath || undefined,
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
