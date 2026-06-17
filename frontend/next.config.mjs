/** @type {import('next').NextConfig} */
const backendUrl = process.env.BACKEND_URL || "https://trading-dashboard-backend.onrender.com";

const nextConfig = {
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
