/** @type {import('next').NextConfig} */
const backendUrl = process.env.BACKEND_URL || "https://carefree-reverence-production.up.railway.app";

const nextConfig = {
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  // Allow long-running AI responses from local Ollama (up to 5 min)
  experimental: { proxyTimeout: 300_000 },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${backendUrl}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
