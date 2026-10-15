/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: process.env.OUTPUT === 'export' ? 'export' : undefined,
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
