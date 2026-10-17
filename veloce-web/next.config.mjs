const isExport = process.env.OUTPUT === 'export';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: isExport ? 'export' : undefined,
  images: {
    unoptimized: true,
  },
  ...(!isExport && {
    async rewrites() {
      return [
        {
          source: '/v1/:path*',
          destination: `${process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8080'}/v1/:path*`,
        },
      ];
    },
  }),
};

export default nextConfig;
