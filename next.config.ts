import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // DEV-SERVER ONLY: origins allowed to load the dev runtime (HMR/RSC/assets).
  // Has no effect on the production server (`next start`), which serves any origin.
  // Includes the home Wi-Fi IPs plus Tailscale. If reaching the phone by a raw
  // 100.x.y.z Tailscale IP rather than the MagicDNS name, add that exact IP here.
  allowedDevOrigins: [
    "192.168.0.50",
    "172.20.176.1",
    "*.ts.net", // Tailscale MagicDNS hostnames (e.g. my-pc.tailXXXX.ts.net)
  ],
};

export default nextConfig;
