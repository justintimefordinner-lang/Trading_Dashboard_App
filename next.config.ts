import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // DEV-SERVER ONLY: origins allowed to load the dev runtime (HMR/RSC/assets).
  // Has no effect on the production server (`next start`), which serves any origin.
  // Add the addresses you use to reach the dev server from other devices (e.g.
  // your phone). Examples:
  //   "192.168.1.42",            // your machine's LAN IP
  //   "my-pc.tailXXXX.ts.net",   // a specific Tailscale MagicDNS host
  allowedDevOrigins: [
    "*.ts.net", // any Tailscale MagicDNS hostname
  ],
};

export default nextConfig;
