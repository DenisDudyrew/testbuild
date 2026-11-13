import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  output: "standalone",
  images: {
    // Authenticated uploads must be fetched by the browser with its own cookies.
    // Disabling the optimizer also prevents its shared cache from bypassing file ACLs.
    unoptimized: true,
    remotePatterns: [
      {
        protocol: "http",
        hostname: "localhost",
        port: "3000",
        pathname: "/**",
      },
    ],
  },
};

export default nextConfig;
